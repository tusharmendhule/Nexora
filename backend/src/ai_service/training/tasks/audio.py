"""Audio trainer — synthetic speech / voice-clone detection (ASVspoof 2019 LA).

Trains an audio classifier on BONA_FIDE vs SPOOF utterances.
Recommended bases: facebook/wav2vec2-base (with feature extractor),
MIT/ast-finetuned-audioset-10-10-fold (AST, via AutoModelForAudioClassification),
or facebook/hubert-base-ls960.

Outputs syntheticProbability / realProbability / confidence — the classifier
reports probabilities, never absolute certainty.
"""

import json
import os
import time

import numpy as np
import torch
import soundfile as sf
from torch.utils.data import DataLoader, Dataset
from transformers import (
    AutoFeatureExtractor,
    AutoModelForAudioClassification,
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

MODEL_NAME = "nexora-audio-synthetic-detector"
MODEL_VERSION = "1.0.0"
MODEL_TYPE = "audio"

TARGET_SAMPLE_RATE = 16000
MAX_DURATION_SECONDS = 10


class AudioLabelDataset(Dataset):
    def __init__(self, rows, feature_extractor, label_to_index):
        self.rows = rows
        self.feature_extractor = feature_extractor
        self.label_to_index = label_to_index

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, idx):
        row = self.rows[idx]
        audio, sr = sf.read(row["audioPath"], dtype="float32")
        if len(audio.shape) > 1:  # mono
            audio = audio.mean(axis=1)
        if sr != TARGET_SAMPLE_RATE:
            # Linear resample (soundfile keeps native sr; wav2vec2 wants 16k)
            num_samples = int(len(audio) * TARGET_SAMPLE_RATE / sr)
            audio = np.interp(
                np.linspace(0, len(audio), num_samples, endpoint=False),
                np.arange(len(audio)),
                audio,
            ).astype(np.float32)
        max_samples = TARGET_SAMPLE_RATE * MAX_DURATION_SECONDS
        if len(audio) > max_samples:
            audio = audio[:max_samples]

        feats = self.feature_extractor(
            audio, sampling_rate=TARGET_SAMPLE_RATE, return_tensors="pt", padding=True
        )
        return {
            "input_values": feats["input_values"].squeeze(0),
            "labels": torch.tensor(self.label_to_index[row["targetLabel"]], dtype=torch.long),
        }


def _evaluate(model, loader, device):
    model.eval()
    total, correct = 0, 0
    with torch.no_grad():
        for batch in loader:
            input_values = batch["input_values"].to(device)
            labels = batch["labels"].to(device)
            outputs = model(input_values=input_values, labels=labels)
            preds = outputs.logits.argmax(dim=-1)
            total += labels.size(0)
            correct += (preds == labels).sum().item()
    return correct / max(1, total)


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

    feature_extractor = AutoFeatureExtractor.from_pretrained(args.model)
    model = AutoModelForAudioClassification.from_pretrained(
        args.model, num_labels=len(label_list), ignore_mismatched_sizes=True
    )
    model.to(args.device)

    train_ds = AudioLabelDataset(train_rows, feature_extractor, label_to_index)
    val_ds = AudioLabelDataset(val_rows, feature_extractor, label_to_index)
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, num_workers=2)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, num_workers=2)

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)
    total_steps = len(train_loader) * args.epochs
    scheduler = get_linear_schedule_with_warmup(
        optimizer, num_warmup_steps=int(0.06 * total_steps), num_training_steps=total_steps
    )

    start = time.time()
    history = []
    best_val_acc = 0.0
    for epoch in range(1, args.epochs + 1):
        model.train()
        total_loss, seen = 0.0, 0
        for batch in train_loader:
            input_values = batch["input_values"].to(args.device)
            labels = batch["labels"].to(args.device)
            outputs = model(input_values=input_values, labels=labels)
            loss = outputs.loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            optimizer.zero_grad()
            total_loss += loss.item()
            seen += 1

        val_acc = _evaluate(model, val_loader, args.device)
        best_val_acc = max(best_val_acc, val_acc)
        avg_loss = total_loss / max(1, seen)
        history.append({"epoch": epoch, "train_loss": round(avg_loss, 4), "val_accuracy": round(val_acc, 4)})
        print(f"epoch {epoch}/{args.epochs}  train_loss={avg_loss:.4f}  val_acc={val_acc:.4f}")

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
            "num_train_rows": len(train_ds),
            "num_val_rows": len(val_ds),
            "epochs": args.epochs,
            "batch_size": args.batch_size,
            "learning_rate": args.lr,
            "seed": args.seed,
            "val_metrics": {"accuracy": round(best_val_acc, 4)},
            "note": "Probabilistic synthetic-speech detector — reports probabilities, "
                    "never absolute certainty.",
        },
    )
    write_history(args.output_dir, history)
    print(f"\nSaved model + metadata to {args.output_dir}")
    print("Next: python training/evaluate.py --task audio --model-dir <dir> --data-dir <dir>")


def main():
    parser = common_train_parser("Fine-tune Nexora synthetic speech detector (ASVspoof)")
    parser.add_argument("--model", default="facebook/wav2vec2-base")
    args = parser.parse_args()
    set_seed(args.seed)
    train(args)


if __name__ == "__main__":
    main()