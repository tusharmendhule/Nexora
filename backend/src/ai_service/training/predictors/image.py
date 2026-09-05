"""CLI inference for a trained AI-generated image detector.

Returns aiGeneratedProbability / realProbability / confidence — a
probabilistic authenticity signal, never a claim about factual truth.
"""

import argparse
import json
import os

import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForImageClassification


def main():
    parser = argparse.ArgumentParser(description="Nexora AI-image detector — CLI inference")
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--image", required=True)
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

    processor = AutoImageProcessor.from_pretrained(args.model_dir)
    model = AutoModelForImageClassification.from_pretrained(args.model_dir)
    model.to(args.device)
    model.eval()

    image = Image.open(args.image).convert("RGB")
    enc = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        logits = model(pixel_values=enc["pixel_values"].to(args.device)).logits
        probs = torch.softmax(logits, dim=-1)[0]

    label_probs = {index_to_label[i]: round(float(p), 4) for i, p in enumerate(probs.tolist())}
    result = {
        "prediction": index_to_label[int(probs.argmax().item())],
        "aiGeneratedProbability": label_probs.get("AI_GENERATED"),
        "realProbability": label_probs.get("REAL"),
        "confidence": round(float(probs.max().item()), 4),
        "model": meta.get("model", "unknown"),
        "version": meta.get("version", "unknown"),
        "note": "Authenticity signal only. AI-generated != false; factual "
                "verification is a separate pipeline stage.",
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()