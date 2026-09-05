"""Evaluate a trained text / claim classifier on the held-out TEST split."""

import argparse
import os

import torch
from torch.utils.data import DataLoader, Dataset
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from evaluators.metrics import (
    compute_metrics,
    load_label_map,
    per_row_records,
    write_report,
)
from trainers_common import load_split


class EvalDataset(Dataset):
    def __init__(self, rows, tokenizer, label_to_index, max_length=256):
        self.rows = rows
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
        }, self.labels[idx]


def main():
    parser = argparse.ArgumentParser(description="Evaluate text/claim model on held-out test split")
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--data-dir", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "preprocessed"))
    parser.add_argument("--output", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "evaluation", "report.json"))
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--max-length", type=int, default=256)
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    args = parser.parse_args()

    test_path = os.path.join(args.data_dir, "test.jsonl")
    if not os.path.exists(test_path):
        raise SystemExit(f"Missing test split: {test_path}. Run preprocess.py first.")

    label_to_index, index_to_label, label_list = load_label_map(args.model_dir)
    rows = [r for r in load_split(test_path) if r["targetLabel"] in label_to_index]
    skipped = len(load_split(test_path)) - len(rows)
    if skipped:
        print(f"  [warn] skipped {skipped} test rows with labels unseen in training")

    tokenizer = AutoTokenizer.from_pretrained(args.model_dir)
    model = AutoModelForSequenceClassification.from_pretrained(args.model_dir)
    model.to(args.device)
    model.eval()

    loader = DataLoader(EvalDataset(rows, tokenizer, label_to_index, args.max_length), batch_size=args.batch_size)
    predictions, probabilities = [], []
    with torch.no_grad():
        for batch, _ in loader:
            input_ids = batch["input_ids"].to(args.device)
            attention_mask = batch["attention_mask"].to(args.device)
            logits = model(input_ids=input_ids, attention_mask=attention_mask).logits
            probs = torch.softmax(logits, dim=-1)
            predictions.extend(logits.argmax(dim=-1).cpu().tolist())
            probabilities.extend(probs.cpu().tolist())

    y_true = [r["target_index"] for r in rows] if "target_index" in rows[0] else \
        [label_to_index[r["targetLabel"]] for r in rows]
    result = compute_metrics(y_true, predictions, probabilities, label_list)
    result["model_dir"] = args.model_dir
    write_report(args.output, result, per_row_records(rows, predictions, probabilities, index_to_label))


if __name__ == "__main__":
    main()