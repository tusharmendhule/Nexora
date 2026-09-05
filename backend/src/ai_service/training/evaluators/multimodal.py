"""Evaluate a trained multimodal (text+image) detector (Fakeddit) on the held-out TEST split."""

import argparse
import json
import os

import torch
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from transformers import AutoImageProcessor, AutoTokenizer

from evaluators.metrics import (
    compute_metrics,
    load_label_map,
    write_report,
)
from trainers_common import load_split

TEXT_MODEL = "distilbert-base-uncased"
IMAGE_MODEL = "google/vit-base-patch16-224"
EMBED_DIM = 768


def _build_model(model_dir, num_labels):
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tasks"))
    from multimodal import MultimodalClassifier
    model = MultimodalClassifier(TEXT_MODEL, IMAGE_MODEL, num_labels)
    state = torch.load(os.path.join(model_dir, "pytorch_model.bin"), map_location="cpu")
    model.load_state_dict(state)
    return model


class MultimodalEvalDataset(Dataset):
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
        enc = self.tokenizer(row["text"], truncation=True, padding="max_length",
                             max_length=self.max_length, return_tensors="pt")
        image = Image.open(row["imagePath"]).convert("RGB")
        img = self.image_processor(images=image, return_tensors="pt")
        return {
            "input_ids": enc["input_ids"].squeeze(0),
            "attention_mask": enc["attention_mask"].squeeze(0),
            "pixel_values": img["pixel_values"].squeeze(0),
        }, self.label_to_index[row["targetLabel"]]


def main():
    parser = argparse.ArgumentParser(description="Evaluate multimodal model on held-out test split")
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--data-dir", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "preprocessed"))
    parser.add_argument("--output", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "evaluation", "report.json"))
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    args = parser.parse_args()

    test_path = os.path.join(args.data_dir, "test.jsonl")
    if not os.path.exists(test_path):
        raise SystemExit(f"Missing test split: {test_path}. Run preprocess.py first.")

    with open(os.path.join(args.model_dir, "model_meta.json")) as f:
        meta = json.load(f)
    label_to_index, index_to_label, label_list = load_label_map(args.model_dir)
    rows = [r for r in load_split(test_path)
            if r["targetLabel"] in label_to_index and r.get("imagePath")]
    if not rows:
        raise SystemExit("No test rows with images available.")

    tokenizer = AutoTokenizer.from_pretrained(args.model_dir)
    image_processor = AutoImageProcessor.from_pretrained(args.model_dir)
    model = _build_model(args.model_dir, len(label_list))
    model.to(args.device)
    model.eval()

    loader = DataLoader(MultimodalEvalDataset(rows, tokenizer, image_processor, label_to_index),
                        batch_size=args.batch_size, num_workers=2)
    predictions, probabilities = [], []
    with torch.no_grad():
        for batch, _ in loader:
            input_ids = batch["input_ids"].to(args.device)
            attention_mask = batch["attention_mask"].to(args.device)
            pixel_values = batch["pixel_values"].to(args.device)
            out = model(input_ids=input_ids, attention_mask=attention_mask, pixel_values=pixel_values)
            probs = torch.softmax(out.logits, dim=-1)
            predictions.extend(out.logits.argmax(dim=-1).cpu().tolist())
            probabilities.extend(probs.cpu().tolist())

    y_true = [label_to_index[r["targetLabel"]] for r in rows]
    result = compute_metrics(y_true, predictions, probabilities, label_list)
    result["model_dir"] = args.model_dir
    result["text_encoder"] = meta.get("text_encoder")
    result["image_encoder"] = meta.get("image_encoder")

    per_row = []
    for r, pred, probs in zip(rows, predictions, probabilities):
        per_row.append({
            "dataset": r.get("dataset"),
            "originalLabel": r.get("originalLabel"),
            "modelPrediction": index_to_label[pred],
            "modelConfidence": round(float(max(probs)), 4),
        })
    write_report(args.output, result, per_row)


if __name__ == "__main__":
    main()