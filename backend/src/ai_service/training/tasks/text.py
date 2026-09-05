"""Text / claim trainer — sequence classification.

Handles:
  text  : LIAR, FakeNewsNet, NELA-GT (binary or multi-class targetLabel)
  claim : FEVER (SUPPORTS / REFUTES / NOT_ENOUGH_INFO)

Recommended bases: distilbert-base-uncased, roberta-base, microsoft/deberta-base.
FEVER claim verification works best with RoBERTa/DeBERTa.
"""

import json
import os
import time

import numpy as np
import torch
from torch.utils.data import DataLoader, Dataset
from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup

from trainers_common import (
    build_label_map,
    common_train_parser,
    load_split,
    save_model_artifacts,
    set_seed,
    write_history,
)

MODEL_NAME = "nexora-text-classifier"
MODEL_VERSION = "1.0.0"
MODEL_TYPE = "text"


class TextLabelDataset(Dataset):
    def __init__(self, rows, tokenizer, label_to_index, max_length=256):
        self.texts = [r["text"] for r in rows]
        self.labels = [label_to_index[r["targetLabel"]] for r in rows]
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self):
        return len(self.texts)

    def __getitem__(self, idx):
        enc = self.tokenizer(
            self.texts[idx],
            truncation=True,
            padding="max_length",
            max_length=self.max_length,
            return_tensors="pt",
        )
        return {
            "input_ids": enc["input_ids"].squeeze(0),
            "attention_mask": enc["attention_mask"].squeeze(0),
            "labels": torch.tensor(self.labels[idx], dtype=torch.long),
        }


def _evaluate(model, loader, device):
    model.eval()
    total, correct = 0, 0
    with torch.no_grad():
        for batch in loader:
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["labels"].to(device)
            outputs = model(input_ids=input_ids, attention_mask=attention_mask, labels=labels)
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

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForSequenceClassification.from_pretrained(
        args.model, num_labels=len(label_list)
    )
    model.to(args.device)

    train_ds = TextLabelDataset(train_rows, tokenizer, label_to_index, args.max_length)
    val_ds = TextLabelDataset(val_rows, tokenizer, label_to_index, args.max_length)
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size)

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
            labels = batch["labels"].to(args.device)
            outputs = model(input_ids=input_ids, attention_mask=attention_mask, labels=labels)
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
        tokenizer=tokenizer,
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
            "max_length": args.max_length,
            "seed": args.seed,
            "val_metrics": {"accuracy": round(best_val_acc, 4)},
            "note": "Val metrics only — the held-out TEST split is evaluated "
                    "by evaluate.py; never during training.",
        },
    )
    write_history(args.output_dir, history)
    print(f"\nSaved model + metadata to {args.output_dir}")
    print("Next: python training/evaluate.py --task text --model-dir <dir> --data-dir <dir>")


def main():
    parser = common_train_parser("Fine-tune Nexora text / claim (FEVER) classifier")
    parser.add_argument("--model", default="distilbert-base-uncased")
    parser.add_argument("--max-length", type=int, default=256)
    args = parser.parse_args()
    set_seed(args.seed)
    train(args)


if __name__ == "__main__":
    main()