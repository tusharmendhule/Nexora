"""CLI inference for a trained video manipulation detector.

Analyzes MULTIPLE frames of a video directory and aggregates with majority
vote — never a single frame verdict.
"""

import argparse
import json
import os
from collections import defaultdict

import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForImageClassification


def main():
    parser = argparse.ArgumentParser(description="Nexora video manipulation detector — CLI inference")
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--video", required=True, help="directory of frames or a single image")
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    args = parser.parse_args()

    with open(os.path.join(args.model_dir, "label_map.json")) as f:
        label_to_index = json.load(f)
    index_to_label = {int(v): k for k, v in label_to_index.items()}
    meta = {}
    meta_path = os.path.join(args.model_dir, "model_meta.json")
    if os.path.exists(meta_path):
        with open(meta_path) as f:
            meta = json.load(f)

    if os.path.isdir(args.video):
        frames = sorted(
            os.path.join(args.video, f)
            for f in os.listdir(args.video)
            if f.lower().endswith((".png", ".jpg", ".jpeg"))
        )
    else:
        frames = [args.video]
    if not frames:
        raise SystemExit("No frames found in the given path.")

    processor = AutoImageProcessor.from_pretrained(args.model_dir)
    model = AutoModelForImageClassification.from_pretrained(args.model_dir)
    model.to(args.device)
    model.eval()

    votes = defaultdict(int)
    frame_probs = []
    with torch.no_grad():
        for frame_path in frames:
            image = Image.open(frame_path).convert("RGB")
            enc = processor(images=image, return_tensors="pt")
            logits = model(pixel_values=enc["pixel_values"].to(args.device)).logits
            probs = torch.softmax(logits, dim=-1)[0]
            pred = index_to_label[int(probs.argmax().item())]
            votes[pred] += 1
            frame_probs.append({"frame": os.path.basename(frame_path),
                                "prediction": pred,
                                "confidence": round(float(probs.max().item()), 4)})

    top = sorted(votes.items(), key=lambda kv: kv[1], reverse=True)
    if len(top) > 1 and top[0][1] == top[1][1]:
        prediction = None
        confidence = None
    else:
        prediction = top[0][0]
        confidence = round(top[0][1] / len(frames), 4)

    result = {
        "prediction": prediction,
        "confidence": confidence,
        "framesAnalyzed": len(frames),
        "frameVotes": dict(votes),
        "frameResults": frame_probs,
        "model": meta.get("model", "unknown"),
        "version": meta.get("version", "unknown"),
        "note": "Temporal aggregation over multiple frames; tie results are "
                "reported as uncertain, never fabricated.",
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()