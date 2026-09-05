"""Image trainer — AI-generated image detection (GenImage).

Trains a vision classifier on REAL vs AI_GENERATED images.
Recommended bases: google/vit-base-patch16-224, facebook/convnext-base-224,
timm/efficientnet_b0 (via transformers/timm adapter) or microsoft/swin-tiny.

IMPORTANT: an AI-generated label is an AUTHENTICITY signal only. It never
implies the content is factually false — the trust engine keeps A and F
separate.
"""

import json
import os
import time

import numpy as np
import torch
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from transformers import (
    AutoImageProcessor,
    AutoModelForImageClassification,
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

MODEL_NAME = "nexora-image-ai-detector"
MODEL_VERSION = "1.0.0"
MODEL_TYPE = "image"


class ImageLabelDataset(Dataset):
    def __init__(self, rows, processor, label_to_index):
        self.rows = rows
        self.processor = processor
        self.label_to_index = label_to_index

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, idx):
        row = self.rows[idx]
        image = Image.open(row["imagePath"]).convert("RGB")
        enc = self.processor(images=image, return_tensors="pt")
        return {
            "pixel_values": enc["pixel_values"].squeeze(0),
            "labels": torch.tensor(self.label_to_index[row["targetLabel"]], dtype=torch.long),
        }


def _evaluate(model, loader, device):
    model.eval()
    total, correct = 0, 0
    with torch.no_grad():
        for batch in loader:
            pixel_values = batch["pixel_values"].to(device)
            labels = batch["labels"].to(device)
            outputs = model(pixel_values=pixel_values, labels=labels)
            preds = outputs.logits.argmax(dim=-1)
            total += labels.size(0)
            correct += (preds == labels).sum().item()
    return correct / max(1, total)


def train(args):
    train_path = os.path.join(args.data_dir, "train.jsonl")
    val_path = os.path.join(args.data_dir, "val.jsonl")
    for p in (train_path, val_path):
        if not os.path.exists(p):
            raise SystemExit(f"Missing preprocessed split: {p}. Run preprocess.py first.")

    train_rows = load_split(train_path)
    val_rows = load_split(val_path)
    label_to_index = build_label_map(train_rows)
    index_to_label = {i: lbl for lbl, i in label_to_index.items()}
    label_list = [index_to_label[i] for i in sorted(index_to_label)]
    print("Training on labels:", label_list)

    processor = AutoImageProcessor.from_pretrained(args.model)
    model = AutoModelForImageClassification.from_pretrained(
        args.model, num_labels=len(label_list), ignore_mismatched_sizes=True
    )
    model.to(args.device)

    train_ds = ImageLabelDataset(train_rows, processor, label_to_index)
    val_ds = ImageLabelDataset(val_rows, processor, label_to_index)
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
            pixel_values = batch["pixel_values"].to(args.device)
            labels = batch["labels"].to(args.device)
            outputs = model(pixel_values=pixel_values, labels=labels)
            loss = outputs.loss
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

    save_model_artifacts(
        args.output_dir,
        model,
        tokenizer=None,
        label_to_index=label_to_index,
        meta_extra={
            "model": MODEL_NAME,
            "version": MODEL_VERSION,
            "modelType": MODEL_TYPE,
            "base_model": args.model,
            "labels": label_list,
            "num_train_rows": len(train_ds),
            "num_val_rows": len(val_ds),
            "epochs": args.epochs,
            "batch_size": args.batch_size,
            "learning_rate": args.lr,
            "seed": args.seed,
            "val_metrics": {"accuracy": round(best_val_acc, 4)},
            "note": "Authenticity-only classifier. AI-generated != false.",
        },
    )
    write_history(args.output_dir, history)
    print(f"\nSaved model + metadata to {args.output_dir}")
    print("Next: python training/evaluate.py --task image --model-dir <dir> --data-dir <dir>")


def main():
    parser = common_train_parser("Fine-tune Nexora AI-generated image detector (GenImage)")
    parser.add_argument("--model", default="google/vit-base-patch16-224")
    args = parser.parse_args()
    set_seed(args.seed)
    train(args)


if __name__ == "__main__":
    main()