"""Evaluate a trained video manipulation detector (held-out TEST split).

Uses temporal aggregation: per-video majority vote across ALL test frames,
so a single suspicious frame can never determine a video's verdict.
"""

import argparse
import os
from collections import defaultdict

import torch
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from transformers import AutoImageProcessor, AutoModelForImageClassification

from evaluators.metrics import (
    compute_metrics,
    load_label_map,
    write_report,
)
from trainers_common import load_split


class FrameEvalDataset(Dataset):
    def __init__(self, rows, processor):
        self.rows = rows
        self.processor = processor

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, idx):
        image = Image.open(self.rows[idx]["framePath"]).convert("RGB")
        enc = self.processor(images=image, return_tensors="pt")
        return enc["pixel_values"].squeeze(0)


def main():
    parser = argparse.ArgumentParser(description="Evaluate video manipulation detector (temporal aggregation)")
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

    loader = DataLoader(FrameEvalDataset(rows, processor), batch_size=args.batch_size, num_workers=2)

    video_counts = defaultdict(lambda: defaultdict(int))  # videoId -> {labelIndex: count}
    with torch.no_grad():
        for i, batch in enumerate(loader):
            pixel_values = batch.to(args.device)
            logits = model(pixel_values=pixel_values).logits
            preds = logits.argmax(dim=-1).cpu().tolist()
            start = i * args.batch_size
            for j, pred in enumerate(preds):
                row = rows[start + j]
                video_counts[row["videoId"]][pred] += 1

    # Aggregate per video: majority vote; ties -> None (uncertain, not fabricated).
    y_true, y_pred, prob_rows = [], [], []
    for video_id, counts in video_counts.items():
        gt = None
        for r in rows:
            if r["videoId"] == video_id:
                gt = r["targetLabel"]
                break
        if gt is None or gt not in label_to_index:
            continue
        top = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
        if len(top) > 1 and top[0][1] == top[1][1]:
            continue  # tie — exclude from metrics, report count separately
        y_true.append(label_to_index[gt])
        y_pred.append(top[0][0])
        prob_rows.append({"videoId": video_id, "frameCount": sum(counts.values()),
                          "dataset": "FaceForensics++", "originalLabel": gt,
                          "modelPrediction": index_to_label[top[0][0]],
                          "frameVotes": {index_to_label[k]: v for k, v in counts.items()}})

    result = compute_metrics(y_true, y_pred, None, label_list)
    result["model_dir"] = args.model_dir
    result["aggregation"] = "per-video majority vote over all test frames"
    result["videos_evaluated"] = len(y_true)
    ties = len(video_counts) - len(y_true)
    if ties:
        print(f"  [info] {ties} videos excluded: frame-vote tie (uncertain)")
        result["tie_videos_excluded"] = ties

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        import json
        json.dump(result, f, indent=2)
    with open(os.path.join(os.path.dirname(args.output), "per_video_predictions.jsonl"), "w", encoding="utf-8") as f:
        for row in prob_rows:
            f.write(json.dumps(row) + "\n")
    print(f"\n=== Held-out TEST evaluation (video-level) ===")
    print(f"videos: {result['videos_evaluated']}")
    print(f"accuracy:        {result['accuracy']}")
    print(f"macro precision: {result['macro_precision']}")
    print(f"macro recall:    {result['macro_recall']}")
    print(f"macro F1:        {result['macro_f1']}")
    print(f"Report saved to {args.output}")


if __name__ == "__main__":
    main()