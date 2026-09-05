"""CLI inference for a trained synthetic-speech detector (ASVspoof).

Returns syntheticProbability / realProbability / confidence — probabilistic,
never absolute certainty.
"""

import argparse
import json
import os

import numpy as np
import soundfile as sf
import torch
from transformers import AutoFeatureExtractor, AutoModelForAudioClassification

TARGET_SAMPLE_RATE = 16000
MAX_DURATION_SECONDS = 10


def main():
    parser = argparse.ArgumentParser(description="Nexora synthetic speech detector — CLI inference")
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--audio", required=True)
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

    feature_extractor = AutoFeatureExtractor.from_pretrained(args.model_dir)
    model = AutoModelForAudioClassification.from_pretrained(args.model_dir)
    model.to(args.device)
    model.eval()

    audio, sr = sf.read(args.audio, dtype="float32")
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

    feats = feature_extractor(audio, sampling_rate=TARGET_SAMPLE_RATE, return_tensors="pt")
    with torch.no_grad():
        logits = model(input_values=feats["input_values"].to(args.device)).logits
        probs = torch.softmax(logits, dim=-1)[0]

    label_probs = {index_to_label[i]: round(float(p), 4) for i, p in enumerate(probs.tolist())}
    result = {
        "prediction": index_to_label[int(probs.argmax().item())],
        "syntheticProbability": label_probs.get("SPOOF"),
        "realProbability": label_probs.get("BONA_FIDE"),
        "confidence": round(float(probs.max().item()), 4),
        "model": meta.get("model", "unknown"),
        "version": meta.get("version", "unknown"),
        "note": "Probabilistic synthetic-speech estimate — not absolute certainty.",
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()