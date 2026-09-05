"""Fast CPU training script — minimal overhead, no bells and whistles."""

import json
import os
import sys
import time

import torch
from torch.utils.data import DataLoader, Dataset
from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup

from trainers_common import build_label_map, load_split, save_model_artifacts, set_seed, write_history

class FastDataset(Dataset):
    def __init__(self, rows, tokenizer, label_to_index, max_length=64):
        self.texts = [r["text"] for r in rows]
        self.labels = [label_to_index[r["targetLabel"]] for r in rows]
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self):
        return len(self.texts)

    def __getitem__(self, idx):
        enc = self.tokenizer(
            self.texts[idx], truncation=True, padding="max_length",
            max_length=self.max_length, return_tensors="pt",
        )
        return {
            "input_ids": enc["input_ids"].squeeze(0),
            "attention_mask": enc["attention_mask"].squeeze(0),
            "labels": torch.tensor(self.labels[idx], dtype=torch.long),
        }


def train_model(task, data_dir, model_name, output_dir, epochs=2, batch_size=64, max_length=64):
    set_seed(42)
    train_path = os.path.join(data_dir, "train.jsonl")
    val_path = os.path.join(data_dir, "val.jsonl")

    train_rows = load_split(train_path)
    val_rows = load_split(val_path)
    label_to_index = build_label_map(train_rows)
    index_to_label = {i: lbl for lbl, i in label_to_index.items()}
    label_list = [index_to_label[i] for i in sorted(index_to_label)]
    print(f"Labels: {label_list}")
    print(f"Train: {len(train_rows)}, Val: {len(val_rows)}")

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSequenceClassification.from_pretrained(model_name, num_labels=len(label_list))
    device = "cpu"
    model.to(device)

    train_ds = FastDataset(train_rows, tokenizer, label_to_index, max_length)
    val_ds = FastDataset(val_rows, tokenizer, label_to_index, max_length)
    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size)

    optimizer = torch.optim.AdamW(model.parameters(), lr=2e-5)
    total_steps = len(train_loader) * epochs
    scheduler = get_linear_schedule_with_warmup(optimizer, num_warmup_steps=int(0.06 * total_steps), num_training_steps=total_steps)

    start = time.time()
    history = []
    for epoch in range(1, epochs + 1):
        model.train()
        total_loss, seen = 0.0, 0
        t0 = time.time()
        for batch in train_loader:
            ids = batch["input_ids"].to(device)
            mask = batch["attention_mask"].to(device)
            labels = batch["labels"].to(device)
            outputs = model(input_ids=ids, attention_mask=mask, labels=labels)
            loss = outputs.loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            optimizer.zero_grad()
            total_loss += loss.item()
            seen += 1

        # Quick val accuracy
        model.eval()
        correct, total = 0, 0
        with torch.no_grad():
            for batch in val_loader:
                ids = batch["input_ids"].to(device)
                mask = batch["attention_mask"].to(device)
                labels = batch["labels"].to(device)
                preds = model(input_ids=ids, attention_mask=mask).logits.argmax(dim=-1)
                total += labels.size(0)
                correct += (preds == labels).sum().item()
        val_acc = correct / max(1, total)
        avg_loss = total_loss / max(1, seen)
        elapsed = time.time() - t0
        history.append({"epoch": epoch, "train_loss": round(avg_loss, 4), "val_accuracy": round(val_acc, 4)})
        print(f"epoch {epoch}/{epochs}  loss={avg_loss:.4f}  val_acc={val_acc:.4f}  time={elapsed:.0f}s")

    total_time = time.time() - start
    print(f"\nTotal training time: {total_time:.0f}s")

    save_model_artifacts(
        output_dir, model, tokenizer=tokenizer, label_to_index=label_to_index,
        meta_extra={
            "model": f"nexora-{task}-classifier",
            "version": "1.0.0",
            "base_model": model_name,
            "labels": label_list,
            "num_train_rows": len(train_ds),
            "num_val_rows": len(val_ds),
            "epochs": epochs,
            "batch_size": batch_size,
            "learning_rate": 2e-5,
            "max_length": max_length,
            "seed": 42,
            "val_metrics": {"accuracy": round(max(h["val_accuracy"] for h in history), 4)},
            "device": device,
        },
    )
    write_history(output_dir, history)
    print(f"Saved to {output_dir}")
    return output_dir


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", required=True, choices=["text", "claim"])
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--model", default="distilbert-base-uncased")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--max-length", type=int, default=64)
    args = parser.parse_args()
    train_model(args.task, args.data_dir, args.model, args.output_dir, args.epochs, args.batch_size, args.max_length)
