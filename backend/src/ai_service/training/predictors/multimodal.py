"""CLI inference for a trained multimodal (text+image) detector (Fakeddit)."""

import argparse
import json
import os
import sys

import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoTokenizer

TEXT_MODEL = "distilbert-base-uncased"
IMAGE_MODEL = "google/vit-base-patch16-224"
EMBED_DIM = 768


def _build_model(model_dir, num_labels):
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tasks"))
    from multimodal import MultimodalClassifier
    model = MultimodalClassifier(TEXT_MODEL, IMAGE_MODEL, num_labels)
    state = torch.load(os.path.join(model_dir, "pytorch_model.bin"), map_location="cpu")
    model.load_state_dict(state)
    return model


def main():
    parser = argparse.ArgumentParser(description="Nexora multimodal detector — CLI inference")
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--text", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--max-length", type=int, default=128)
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
    image_processor = AutoImageProcessor.from_pretrained(args.model_dir)
    model = _build_model(args.model_dir, len(label_to_index))
    model.to(args.device)
    model.eval()

    enc = tokenizer(args.text, truncation=True, padding="max_length",
                    max_length=args.max_length, return_tensors="pt")
    image = Image.open(args.image).convert("RGB")
    img = image_processor(images=image, return_tensors="pt")

    with torch.no_grad():
        out = model(
            input_ids=enc["input_ids"].to(args.device),
            attention_mask=enc["attention_mask"].to(args.device),
            pixel_values=img["pixel_values"].to(args.device),
        )
        probs = torch.softmax(out.logits, dim=-1)[0]

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