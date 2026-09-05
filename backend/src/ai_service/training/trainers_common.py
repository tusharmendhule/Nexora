"""Shared utilities for the Nexora training pipeline.

Used by all task trainers (text, claim, image, video, audio, multimodal).
Keeps the ORIGINAL dataset label separate from the model prediction in every
artifact it writes.
"""

import json
import os
import random
import time

import numpy as np
import torch


def load_split(path):
    """Load a preprocessed JSONL split into a list of dicts."""
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def build_label_map(rows):
    """Build {targetLabel: index} from the TRAIN split only.

    Labels are sorted for determinism. The test split may contain labels
    absent from training in pathological datasets; those rows are dropped
    at evaluation time and reported, never silently relabeled.
    """
    labels = sorted({r["targetLabel"] for r in rows})
    return {lbl: i for i, lbl in enumerate(labels)}


def set_seed(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def save_model_artifacts(
    output_dir,
    model,
    tokenizer=None,
    label_to_index=None,
    meta_extra=None,
):
    """Persist model + tokenizer + label map + metadata in HF format."""
    os.makedirs(output_dir, exist_ok=True)
    model.save_pretrained(output_dir)
    if tokenizer is not None:
        tokenizer.save_pretrained(output_dir)
    if label_to_index is not None:
        with open(os.path.join(output_dir, "label_map.json"), "w") as f:
            json.dump(label_to_index, f, indent=2)

    meta = {
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "torch_version": torch.__version__,
        "numpy_version": np.__version__,
    }
    if meta_extra:
        meta.update(meta_extra)
    with open(os.path.join(output_dir, "model_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)


def write_history(output_dir, history):
    with open(os.path.join(output_dir, "training_history.json"), "w") as f:
        json.dump(history, f, indent=2)


def common_train_parser(description):
    """Shared CLI args used by every trainer."""
    import argparse

    here = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--data-dir", default=os.path.join(here, "preprocessed"))
    parser.add_argument("--output-dir", default=os.path.join(here, "models", "nexora-model"))
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    return parser