"""Evaluate a trained AI-generated image detector on the held-out TEST split."""

import argparse
import os

import torch
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from transformers import AutoImageProcessor, AutoModelForImageClassification

from evaluators.metrics import (
    compute_metrics,
    load_label_map,
    per_row_records,
    write_report,
)
from trainers_common import load_split


class ImageEvalDataset(Dataset):
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
        return enc["pixel_values"].squeeze(0), self.label_to_index[row["targetLabel"]]


def main():
    parser = argparse.ArgumentParser(description="Evaluate image AI-detector on held-out test split")
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--data-dir", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "preprocessed"))
    parser.add_argument("--output", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "evaluation", "report.json"))
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    args = parser.parse_args()

    test_path = os.path.join(args.data_dir, "test.jsonl")
    if not os.path.exists(test_path):
        raise SystemExit(f"Missing test split: {test_path}. Run preprocess.py first.")

    label_to_index, index_to_label, label_list = load_label_map(args.model_dir)
    rows = [r for r in load_split(test_path) if r["targetLabel"] in label_to_index]

    processor = AutoImageProcessor.from_pretrained(args.model_dir)
    model = AutoModelForImageClassification.from_pretrained(args.model_dir)
    model.to(args.device)
    model.eval()

    loader = DataLoader(ImageEvalDataset(rows, processor, label_to_index), batch_size=args.batch_size, num_workers=2)
    predictions, probabilities = [], []
    with torch.no_grad():
        for batch, _ in loader:
            pixel_values = batch.to(args.device)
            logits = model(pixel_values=pixel_values).logits
            probs = torch.softmax(logits, dim=-1)
            predictions.extend(logits.argmax(dim=-1).cpu().tolist())
            probabilities.extend(probs.cpu().tolist())

    y_true = [label_to_index[r["targetLabel"]] for r in rows]
    result = compute_metrics(y_true, predictions, probabilities, label_list)
    result["model_dir"] = args.model_dir
    write_report(args.output, result, per_row_records(rows, predictions, probabilities, index_to_label))


if __name__ == "__main__":
    main()