"""Evaluate a trained synthetic-speech detector (ASVspoof) on the held-out TEST split."""

import argparse
import os

import numpy as np
import soundfile as sf
import torch
from torch.utils.data import DataLoader, Dataset
from transformers import AutoFeatureExtractor, AutoModelForAudioClassification

from evaluators.metrics import (
    compute_metrics,
    load_label_map,
    per_row_records,
    write_report,
)
from trainers_common import load_split

TARGET_SAMPLE_RATE = 16000
MAX_DURATION_SECONDS = 10


class AudioEvalDataset(Dataset):
    def __init__(self, rows, feature_extractor):
        self.rows = rows
        self.feature_extractor = feature_extractor

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, idx):
        row = self.rows[idx]
        audio, sr = sf.read(row["audioPath"], dtype="float32")
        if len(audio.shape) > 1:
            audio = audio.mean(axis=1)
        if sr != TARGET_SAMPLE_RATE:
            num_samples = int(len(audio) * TARGET_SAMPLE_RATE / sr)
            audio = np.interp(
                np.linspace(0, len(audio), num_samples, endpoint=False),
                np.arange(len(audio)), audio,
            ).astype(np.float32)
        max_samples = TARGET_SAMPLE_RATE * MAX_DURATION_SECONDS
        if len(audio) > max_samples:
            audio = audio[:max_samples]
        feats = self.feature_extractor(
            audio, sampling_rate=TARGET_SAMPLE_RATE, return_tensors="pt", padding=True
        )
        return feats["input_values"].squeeze(0)


def main():
    parser = argparse.ArgumentParser(description="Evaluate synthetic speech detector (held-out test split)")
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--data-dir", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "preprocessed"))
    parser.add_argument("--output", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "evaluation", "report.json"))
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    args = parser.parse_args()

    test_path = os.path.join(args.data_dir, "test.jsonl")
    if not os.path.exists(test_path):
        raise SystemExit(f"Missing test split: {test_path}. Run preprocess.py first.")

    label_to_index, index_to_label, label_list = load_label_map(args.model_dir)
    rows = [r for r in load_split(test_path) if r["targetLabel"] in label_to_index]

    feature_extractor = AutoFeatureExtractor.from_pretrained(args.model_dir)
    model = AutoModelForAudioClassification.from_pretrained(args.model_dir)
    model.to(args.device)
    model.eval()

    loader = DataLoader(AudioEvalDataset(rows, feature_extractor), batch_size=args.batch_size, num_workers=2)
    predictions, probabilities = [], []
    with torch.no_grad():
        for batch in loader:
            input_values = batch.to(args.device)
            logits = model(input_values=input_values).logits
            probs = torch.softmax(logits, dim=-1)
            predictions.extend(logits.argmax(dim=-1).cpu().tolist())
            probabilities.extend(probs.cpu().tolist())

    y_true = [label_to_index[r["targetLabel"]] for r in rows]
    result = compute_metrics(y_true, predictions, probabilities, label_list)
    result["model_dir"] = args.model_dir
    write_report(args.output, result, per_row_records(rows, predictions, probabilities, index_to_label))


if __name__ == "__main__":
    main()