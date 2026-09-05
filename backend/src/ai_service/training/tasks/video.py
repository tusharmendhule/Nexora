"""Video trainer — manipulation/deepfake detection (FaceForensics++).

Trains a frame-level vision classifier (REAL vs MANIPULATED) and evaluates
with TEMPORAL AGGREGATION: every video is scored by combining all its frames
(majority vote / mean probability), never by a single suspicious frame.

The preprocess step already samples up to 25 evenly spaced frames per video
for training; evaluation uses the same frame rows and aggregates per videoId.
"""

import json
import os
import time
from collections import defaultdict

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

MODEL_NAME = "nexora-video-manipulation-detector"
MODEL_VERSION = "1.0.0"
MODEL_TYPE = "video"


class FrameDataset(Dataset):
    def __init__(self, rows, processor, label_to_index):
        self.rows = rows
        self.processor = processor
        self.label_to_index = label_to_index

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, idx):
        row = self.rows[idx]
        image = Image.open(row["framePath"]).convert("RGB")
        enc = self.processor(images=image, return_tensors="pt")
        return {
            "pixel_values": enc["pixel_values"].squeeze(0),
            "labels": torch.tensor(self.label_to_index[row["targetLabel"]], dtype=torch.long),
        }


def _evaluate_videos(model, rows, processor, label_to_index, device, batch_size):
    """Frame-level inference + per-video temporal aggregation."""
    index_to_label = {i: lbl for lbl, i in label_to_index.items()}
    model.eval()

    loader = DataLoader(FrameDataset(rows, processor, label_to_index), batch_size=batch_size, num_workers=2)
    video_preds = defaultdict(list)  # videoId -> list of predicted labels
    video_probs = defaultdict(list)  # videoId -> list of (label, prob)
    frame_results = []

    with torch.no_grad():
        for batch in loader:
            pixel_values = batch["pixel_values"].to(device)
            labels = batch["labels"].cpu().tolist()
            logits = model(pixel_values=pixel_values).logits
            probs = torch.softmax(logits, dim=-1)
            preds = logits.argmax(dim=-1).cpu().tolist()
            probs_list = probs.cpu().tolist()

            start = len(frame_results)
            for i in range(len(labels)):
                video_preds[rows[start + i]["videoId"]].append(preds[i])
                video_probs[rows[start + i]["videoId"]].append(
                    {index_to_label[j]: round(p, 4) for j, p in enumerate(probs_list[i])}
                )
            frame_results.extend(zip(preds, labels))

    # Temporal aggregation: majority vote per video; tie -> uncertain.
    video_rows = []
    for video_id, preds in video_preds.items():
        counts = defaultdict(int)
        for p in preds:
            counts[p] += 1
        top = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
        if len(top) > 1 and top[0][1] == top[1][1]:
            video_label = None  # tie -> uncertain, not fabricated
        else:
            video_label = index_to_label[top[0][0]]
        video_rows.append({"videoId": video_id, "prediction": video_label, "frameCount": len(preds)})

    return video_rows, frame_results


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

    train_ds = FrameDataset(train_rows, processor, label_to_index)
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, num_workers=2)

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)
    total_steps = len(train_loader) * args.epochs
    scheduler = get_linear_schedule_with_warmup(
        optimizer, num_warmup_steps=int(0.06 * total_steps), num_training_steps=total_steps
    )

    start = time.time()
    history = []
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

        avg_loss = total_loss / max(1, seen)
        # Video-level accuracy on validation (temporal aggregation).
        val_videos, _ = _evaluate_videos(model, val_rows, processor, label_to_index, args.device, args.batch_size)
        correct = sum(1 for v in val_videos if v["prediction"] is not None
                      and v["prediction"] == _video_ground_truth(val_rows, v["videoId"]))
        val_acc = correct / max(1, len(val_videos))
        history.append({"epoch": epoch, "train_loss": round(avg_loss, 4), "val_video_accuracy": round(val_acc, 4)})
        print(f"epoch {epoch}/{args.epochs}  train_loss={avg_loss:.4f}  val_video_acc={val_acc:.4f}")

    # Final validation video-level metrics.
    val_videos, _ = _evaluate_videos(model, val_rows, processor, label_to_index, args.device, args.batch_size)
    correct = sum(1 for v in val_videos if v["prediction"] is not None
                  and v["prediction"] == _video_ground_truth(val_rows, v["videoId"]))
    val_video_acc = correct / max(1, len(val_videos))

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
            "num_train_frames": len(train_ds),
            "num_val_videos": len(val_videos),
            "epochs": args.epochs,
            "batch_size": args.batch_size,
            "learning_rate": args.lr,
            "seed": args.seed,
            "val_metrics": {"video_accuracy": round(val_video_acc, 4)},
            "note": "Video-level accuracy uses temporal aggregation (majority vote over frames).",
        },
    )
    write_history(args.output_dir, history)
    print(f"\nSaved model + metadata to {args.output_dir}")
    print("Next: python training/evaluate.py --task video --model-dir <dir> --data-dir <dir>")


def _video_ground_truth(rows, video_id):
    for r in rows:
        if r["videoId"] == video_id:
            return r["targetLabel"]
    return None


def main():
    parser = common_train_parser("Fine-tune Nexora video manipulation detector (FaceForensics++)")
    parser.add_argument("--model", default="google/vit-base-patch16-224")
    args = parser.parse_args()
    set_seed(args.seed)
    train(args)


if __name__ == "__main__":
    main()