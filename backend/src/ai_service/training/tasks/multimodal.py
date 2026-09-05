"""Multimodal trainer — text + image fake-news detection (Fakeddit).

Architecture: Text Encoder (DistilBERT) + Vision Encoder (ViT) -> concat
-> classifier head. Trains jointly on the Fakeddit 2-way target (TRUE/FALSE)
while preserving the original 6-way label.

If imagePath is null for some rows (Reddit images not fetched), those rows
are skipped with a count — the model is only trained on rows that have both
modalities present. This is reported, not silently papered over.
"""

import json
import os
import time

import numpy as np
import torch
from PIL import Image
from torch import nn
from torch.utils.data import DataLoader, Dataset
from transformers import (
    AutoImageProcessor,
    AutoModel,
    AutoTokenizer,
    get_linear_schedule_with_warmup,
)

from trainers_common import (
    build_label_map,
    common_train_parser,
    load_split,
    save_model_artifacts,
    set_seed,
    write_history,
)

MODEL_NAME = "nexora-multimodal-fakeddit"
MODEL_VERSION = "1.0.0"
MODEL_TYPE = "multimodal"

TEXT_MODEL = "distilbert-base-uncased"
IMAGE_MODEL = "google/vit-base-patch16-224"
EMBED_DIM = 768  # distilbert hidden size


class MultimodalClassifier(nn.Module):
    def __init__(self, text_model_name, image_model_name, num_labels):
        super().__init__()
        self.text_encoder = AutoModel.from_pretrained(text_model_name)
        self.image_encoder = AutoModel.from_pretrained(image_model_name)
        text_dim = self.text_encoder.config.hidden_size
        image_dim = self.image_encoder.config.hidden_size
        self.classifier = nn.Sequential(
            nn.Linear(text_dim + image_dim, EMBED_DIM),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(EMBED_DIM, num_labels),
        )
        self.config = type(
            "Config",
            (),
            {"text_hidden_size": text_dim, "image_hidden_size": image_dim, "num_labels": num_labels},
        )

    def forward(self, input_ids, attention_mask, pixel_values, labels=None):
        text_out = self.text_encoder(input_ids=input_ids, attention_mask=attention_mask)
        image_out = self.image_encoder(pixel_values=pixel_values)
        pooled = torch.cat([text_out.last_hidden_state[:, 0], image_out.pooler_output], dim=-1)
        logits = self.classifier(pooled)
        loss = None
        if labels is not None:
            loss = nn.functional.cross_entropy(logits, labels)
        return type("Out", (), {"logits": logits, "loss": loss})


class MultimodalDataset(Dataset):
    def __init__(self, rows, tokenizer, image_processor, label_to_index, max_length=128):
        self.rows = rows
        self.tokenizer = tokenizer
        self.image_processor = image_processor
        self.label_to_index = label_to_index
        self.max_length = max_length

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, idx):
        row = self.rows[idx]
        enc = self.tokenizer(
            row["text"], truncation=True, padding="max_length",
            max_length=self.max_length, return_tensors="pt",
        )
        image = Image.open(row["imagePath"]).convert("RGB")
        img = self.image_processor(images=image, return_tensors="pt")
        return {
            "input_ids": enc["input_ids"].squeeze(0),
            "attention_mask": enc["attention_mask"].squeeze(0),
            "pixel_values": img["pixel_values"].squeeze(0),
            "labels": torch.tensor(self.label_to_index[row["targetLabel"]], dtype=torch.long),
        }


def _evaluate(model, loader, device):
    model.eval()
    total, correct = 0, 0
    with torch.no_grad():
        for batch in loader:
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            pixel_values = batch["pixel_values"].to(device)
            labels = batch["labels"].to(device)
            out = model(input_ids=input_ids, attention_mask=attention_mask, pixel_values=pixel_values)
            preds = out.logits.argmax(dim=-1)
            total += labels.size(0)
            correct += (preds == labels).sum().item()
    return correct / max(1, total)


def train(args):
    train_path = os.path.join(args.data_dir, "train.jsonl")
    val_path = os.path.join(args.data_dir, "val.jsonl")
    for p in (train_path, val_path):
        if not os.path.exists(p):
            raise SystemExit(f"Missing preprocessed split: {p}. Run preprocess.py first.")

    def _rows_with_images(path):
        rows = load_split(path)
        with_image = [r for r in rows if r.get("imagePath")]
        if len(with_image) < len(rows):
            print(f"  [warn] {path}: skipped {len(rows) - len(with_image)} rows without images "
                  f"(fetch Fakeddit images via Reddit API).")
        return with_image

    train_rows = _rows_with_images(train_path)
    val_rows = _rows_with_images(val_path)
    if not train_rows:
        raise SystemExit("No training rows with images — run preprocess with Fakeddit images present.")

    label_to_index = build_label_map(train_rows)
    index_to_label = {i: lbl for lbl, i in label_to_index.items()}
    label_list = [index_to_label[i] for i in sorted(index_to_label)]
    print("Training on labels:", label_list)

    tokenizer = AutoTokenizer.from_pretrained(TEXT_MODEL)
    image_processor = AutoImageProcessor.from_pretrained(IMAGE_MODEL)
    model = MultimodalClassifier(TEXT_MODEL, IMAGE_MODEL, len(label_list))
    model.to(args.device)

    train_ds = MultimodalDataset(train_rows, tokenizer, image_processor, label_to_index)
    val_ds = MultimodalDataset(val_rows, tokenizer, image_processor, label_to_index)
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, num_workers=2)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, num_workers=2)

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)
    total_steps = len(train_loader) * args.epochs
    scheduler = get_linear_schedule_with_warmup(
        optimizer, num_warmup_steps=int(0.06 * total_steps), num_training_steps=total_steps
    )

    start = time.time()
    history = []
    best_val_acc = 0.0
    for epoch in range(1, args.epochs + 1):
        model.train()
        total_loss, seen = 0.0, 0
        for batch in train_loader:
            input_ids = batch["input_ids"].to(args.device)
            attention_mask = batch["attention_mask"].to(args.device)
            pixel_values = batch["pixel_values"].to(args.device)
            labels = batch["labels"].to(args.device)
            out = model(input_ids=input_ids, attention_mask=attention_mask, pixel_values=pixel_values, labels=labels)
            loss = out.loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            optimizer.zero_grad()
            total_loss += loss.item()
            seen += 1

        val_acc = _evaluate(model, val_loader, args.device)
        best_val_acc = max(best_val_acc, val_acc)
        avg_loss = total_loss / max(1, seen)
        history.append({"epoch": epoch, "train_loss": round(avg_loss, 4), "val_accuracy": round(val_acc, 4)})
        print(f"epoch {epoch}/{args.epochs}  train_loss={avg_loss:.4f}  val_acc={val_acc:.4f}")

    # Persist in a way the multimodal inference adapter can load.
    os.makedirs(args.output_dir, exist_ok=True)
    torch.save(model.state_dict(), os.path.join(args.output_dir, "pytorch_model.bin"))
    with open(os.path.join(args.output_dir, "label_map.json"), "w") as f:
        json.dump(label_to_index, f, indent=2)
    tokenizer.save_pretrained(args.output_dir)
    image_processor.save_pretrained(args.output_dir)
    meta = {
        "model": MODEL_NAME,
        "version": MODEL_VERSION,
        "modelType": MODEL_TYPE,
        "text_encoder": TEXT_MODEL,
        "image_encoder": IMAGE_MODEL,
        "labels": label_list,
        "num_train_rows": len(train_ds),
        "num_val_rows": len(val_ds),
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "learning_rate": args.lr,
        "seed": args.seed,
        "val_metrics": {"accuracy": round(best_val_acc, 4)},
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "note": "Multimodal (text+image) fusion. Original 6-way Fakeddit label "
                "preserved in originalLabel; model trained on documented 2-way target.",
    }
    with open(os.path.join(args.output_dir, "model_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    write_history(args.output_dir, history)
    print(f"\nSaved model + metadata to {args.output_dir}")
    print("Next: python training/evaluate.py --task multimodal --model-dir <dir> --data-dir <dir>")


def main():
    parser = common_train_parser("Fine-tune Nexora multimodal (text+image) fake-news detector (Fakeddit)")
    args = parser.parse_args()
    set_seed(args.seed)
    train(args)


if __name__ == "__main__":
    main()