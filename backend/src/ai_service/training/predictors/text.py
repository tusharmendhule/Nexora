"""CLI inference for a trained text / claim model.

Output is probabilistic (prediction, confidence, per-label probabilities,
model name + version) — never absolute certainty.
"""

import argparse
import json
import os

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer


def main():
    parser = argparse.ArgumentParser(description="Nexora text/claim classifier — CLI inference")
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--text", required=True)
    parser.add_argument("--max-length", type=int, default=256)
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

    tokenizer = AutoTokenizer.from_pretrained(args.model_dir)
    model = AutoModelForSequenceClassification.from_pretrained(args.model_dir)
    model.to(args.device)
    model.eval()

    enc = tokenizer(args.text, truncation=True, padding="max_length",
                    max_length=args.max_length, return_tensors="pt")
    with torch.no_grad():
        logits = model(
            input_ids=enc["input_ids"].to(args.device),
            attention_mask=enc["attention_mask"].to(args.device),
        ).logits
        probs = torch.softmax(logits, dim=-1)[0]

    result = {
        "prediction": index_to_label[int(probs.argmax().item())],
        "confidence": round(float(probs.max().item()), 4),
        "probabilities": {
            index_to_label[i]: round(float(p), 4) for i, p in enumerate(probs.tolist())
        },
        "model": meta.get("model", "unknown"),
        "version": meta.get("version", "unknown"),
        "note": "Probabilistic estimate — not absolute certainty.",
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()