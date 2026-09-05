"""Preprocess labeled datasets for Nexora training (all modalities).

For every row the ORIGINAL dataset label is preserved verbatim in
`originalLabel`. An optional `targetLabel` (the class the model is trained
on) is derived from documented rules and stored separately — the original
label is never replaced.

Modalities supported:

  text       LIAR, FakeNewsNet, NELA-GT        -> row has `text`
  claim      FEVER                             -> row has `text` (claim)
  image      GenImage                          -> row has `imagePath`
  video      FaceForensics++                   -> row has `videoId` + `frames[]`
  audio      ASVspoof                          -> row has `audioPath`
  multimodal Fakeddit                          -> row has `text` + optional `imagePath`

Splits (train/validation/test) are created BEFORE any tokenization and the
test split is never used for training or hyperparameter selection.
"""

import argparse
import csv
import json
import os
import random

PREPROCESSED_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "preprocessed")
DATASETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "datasets")

# ─── Label maps (original → training target) ──────────────────────────
LIAR_TARGET_MAP = {
    "true": "NOT_FALSE",
    "mostly-true": "NOT_FALSE",
    "half-true": "NOT_FALSE",
    "barely-true": "FALSE",
    "false": "FALSE",
    "pants-fire": "FALSE",
}

FEVER_TARGET_MAP = {
    "SUPPORTS": "SUPPORTS",
    "REFUTES": "REFUTES",
    "NOT ENOUGH INFO": "NOT_ENOUGH_INFO",
}

# NELA-GT source-reliability labels are used verbatim.
NELA_GT_VALID_LABELS = {"RELIABLE", "UNRELIABLE", "MIXED"}

# FakeNewsNet real/fake.
FAKENEWSNET_LABELS = {"REAL", "FAKE"}

# Fakeddit: use the documented 2-way label (true vs false) as the target,
# keep the original 6-way label untouched.
FAKEDDIT_TWO_WAY = {"true": "TRUE", "false": "FALSE"}


# ─── Loaders ───────────────────────────────────────────────────────────

def load_liar(split_path):
    rows = []
    with open(split_path, newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f, delimiter="\t")
        for line in reader:
            if len(line) < 3:
                continue
            original_label = line[1].strip().lower()
            if original_label not in LIAR_TARGET_MAP:
                continue
            rows.append({
                "dataset": "LIAR",
                "modality": "text",
                "originalLabel": original_label,
                "targetLabel": LIAR_TARGET_MAP[original_label],
                "text": line[2].strip(),
            })
    return rows


def load_fever(split_path):
    rows = []
    with open(split_path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            original_label = (obj.get("label") or "").strip().upper()
            claim = (obj.get("claim") or "").strip()
            if not claim or original_label not in FEVER_TARGET_MAP:
                continue
            rows.append({
                "dataset": "FEVER",
                "modality": "claim",
                "originalLabel": original_label,
                "targetLabel": FEVER_TARGET_MAP[original_label],
                "text": claim,
            })
    return rows


def load_fakenewsnet():
    rows = []
    base = os.path.join(DATASETS_DIR, "fakenewsnet")
    for folder, original in (("REAL", "REAL"), ("FAKE", "FAKE")):
        dir_path = os.path.join(base, folder)
        if not os.path.isdir(dir_path):
            continue
        for fname in os.listdir(dir_path):
            if not fname.endswith(".txt"):
                continue
            with open(os.path.join(dir_path, fname), encoding="utf-8", errors="replace") as f:
                text = f.read().strip()
            if len(text) >= 40:
                rows.append({
                    "dataset": "FakeNewsNet",
                    "modality": "text",
                    "originalLabel": original,
                    "targetLabel": original,
                    "text": text,
                })
    return rows


def load_nela_gt():
    """NELA-GT: articles.jsonl with {source, text, reliabilityLabel}.
    The source-level label (RELIABLE/UNRELIABLE/MIXED) is the ORIGINAL
    ground truth and is preserved. Source reliability is a training signal
    for S(C), NOT a claim-truth label.
    """
    rows = []
    path = os.path.join(DATASETS_DIR, "nela-gt", "articles.jsonl")
    if not os.path.isfile(path):
        return rows
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            label = (obj.get("reliabilityLabel") or "").strip().upper()
            text = (obj.get("text") or "").strip()
            if label not in NELA_GT_VALID_LABELS or len(text) < 40:
                continue
            rows.append({
                "dataset": "NELA-GT",
                "modality": "text",
                "originalLabel": label,
                "targetLabel": label,
                "source": (obj.get("source") or "").strip(),
                "text": text,
            })
    return rows


def load_fakeddit():
    """Fakeddit: official fakeddit.jsonl metadata + optional downloaded images.
    Images are keyed by <id>.<ext> under datasets/fakeddit/images/.
    Text-only training works when images are absent (Reddit API required to
    fetch them); rows simply carry a null imagePath then.
    """
    rows = []
    meta_path = os.path.join(DATASETS_DIR, "fakeddit", "fakeddit.jsonl")
    if not os.path.isfile(meta_path):
        return rows
    images_dir = os.path.join(DATASETS_DIR, "fakeddit", "images")
    with open(meta_path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            original_label = (obj.get("label") or "").strip().lower()
            text = (obj.get("title") or "").strip() + " " + (obj.get("selftext") or "").strip()
            if original_label not in FAKEDDIT_TWO_WAY or len(text.strip()) < 10:
                continue
            image_path = None
            if os.path.isdir(images_dir):
                img_id = str(obj.get("id") or "")
                for ext in (".jpg", ".jpeg", ".png"):
                    candidate = os.path.join(images_dir, img_id + ext)
                    if os.path.isfile(candidate):
                        image_path = candidate
                        break
            rows.append({
                "dataset": "Fakeddit",
                "modality": "multimodal",
                "originalLabel": original_label,
                "targetLabel": FAKEDDIT_TWO_WAY[original_label],
                "text": text.strip(),
                "imagePath": image_path,
            })
    return rows


def load_genimage():
    """GenImage: official layout datasets/genimage/<split>/{0_real,1_ai}/**/*.jpg"""
    rows = []
    base = os.path.join(DATASETS_DIR, "genimage")
    if not os.path.isdir(base):
        return rows
    for split in ("train", "val", "test"):
        for folder, original in (("0_real", "REAL"), ("1_ai", "AI_GENERATED")):
            dir_path = os.path.join(base, split, folder)
            if not os.path.isdir(dir_path):
                continue
            for fname in os.listdir(dir_path):
                if not fname.lower().endswith((".jpg", ".jpeg", ".png")):
                    continue
                rows.append({
                    "dataset": "GenImage",
                    "modality": "image",
                    "originalLabel": original,
                    "targetLabel": original,
                    "imagePath": os.path.join(dir_path, fname),
                })
    return rows


def load_faceforensics():
    """FaceForensics++: frame directories. original_sequences -> REAL,
    manipulated_sequences -> MANIPULATED. Each row is one sampled frame with
    a videoId; temporal aggregation happens at evaluation time.
    """
    rows = []
    base = os.path.join(DATASETS_DIR, "faceforensics")
    if not os.path.isdir(base):
        return rows
    for split in os.listdir(base):
        split_dir = os.path.join(base, split)
        if not os.path.isdir(split_dir):
            continue
        for kind, original in (("original_sequences", "REAL"), ("manipulated_sequences", "MANIPULATED")):
            kind_dir = os.path.join(split_dir, kind)
            if not os.path.isdir(kind_dir):
                continue
            for video_name in os.listdir(kind_dir):
                images_dir = os.path.join(kind_dir, video_name, "images")
                if not os.path.isdir(images_dir):
                    continue
                frames = sorted(
                    os.path.join(images_dir, f)
                    for f in os.listdir(images_dir)
                    if f.lower().endswith((".png", ".jpg"))
                )
                if not frames:
                    continue
                # Sample up to 25 evenly spaced frames per video for training
                # (evaluation samples all of them for correct aggregation).
                step = max(1, len(frames) // 25)
                sampled = frames[::step]
                for frame in sampled:
                    rows.append({
                        "dataset": "FaceForensics++",
                        "modality": "video",
                        "originalLabel": original,
                        "targetLabel": original,
                        "videoId": f"{split}/{kind}/{video_name}",
                        "framePath": frame,
                    })
    return rows


def load_asvspoof():
    """ASVspoof 2019 LA: protocol files map utterance ids to BONA_FIDE/SPOOF.
    Rows carry the .flac path (16 kHz) — the audio trainer resamples/featurizes.
    """
    rows = []
    base = os.path.join(DATASETS_DIR, "asvspoof")
    if not os.path.isdir(base):
        return rows
    for proto_name, split_dir in (
        ("ASVspoof2019.LA.cm.trn.txt", "ASVspoof2019_LA_train"),
        ("ASVspoof2019.LA.cm.dev.txt", "ASVspoof2019_LA_dev"),
        ("ASVspoof2019.LA.cm.eval.txt", "ASVspoof2019_LA_eval"),
    ):
        proto_path = os.path.join(base, proto_name)
        if not os.path.isfile(proto_path):
            continue
        with open(proto_path, encoding="utf-8", errors="replace") as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) < 5:
                    continue
                utt_id = parts[1]
                original_label = "SPOOF" if parts[4].upper() == "SPOOF" else "BONA_FIDE"
                audio_path = os.path.join(base, split_dir, "flac", f"{utt_id}.flac")
                if not os.path.isfile(audio_path):
                    continue
                rows.append({
                    "dataset": "ASVspoof",
                    "modality": "audio",
                    "originalLabel": original_label,
                    "targetLabel": original_label,
                    "audioPath": audio_path,
                })
    return rows


# ─── Shared helpers ────────────────────────────────────────────────────

def clean_text(text):
    return " ".join(text.replace("\n", " ").replace("\r", " ").split())[:5000]


def split_rows(rows, seed=42, val_ratio=0.1, test_ratio=0.1):
    """Stratified-ish split by target label; the test split is held out entirely."""
    rng = random.Random(seed)
    by_label = {}
    for row in rows:
        by_label.setdefault(row["targetLabel"], []).append(row)

    train, val, test = [], [], []
    for label, group in by_label.items():
        rng.shuffle(group)
        n = len(group)
        n_test = int(n * test_ratio)
        n_val = int(n * val_ratio)
        test.extend(group[:n_test])
        val.extend(group[n_test : n_test + n_val])
        train.extend(group[n_test + n_val :])

    rng.shuffle(train)
    rng.shuffle(val)
    rng.shuffle(test)
    return train, val, test


def main():
    parser = argparse.ArgumentParser(description="Preprocess Nexora datasets (all modalities)")
    parser.add_argument(
        "--datasets",
        nargs="+",
        default=["liar"],
        choices=["liar", "fever", "fakenewsnet", "nela-gt", "fakeddit", "genimage", "faceforensics", "asvspoof"],
    )
    parser.add_argument("--output-dir", default=PREPROCESSED_DIR)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--val-ratio", type=float, default=0.1)
    parser.add_argument("--test-ratio", type=float, default=0.1)
    args = parser.parse_args()

    def _load_liar_all():
        rows = []
        for split in ("train", "valid", "test"):
            p = os.path.join(DATASETS_DIR, "liar", f"{split}.tsv")
            if os.path.exists(p):
                rows.extend(load_liar(p))
        return rows

    def _load_fever_all():
        rows = []
        for split in ("train", "dev"):
            p = os.path.join(DATASETS_DIR, "fever", f"{split}.jsonl")
            if os.path.exists(p):
                rows.extend(load_fever(p))
        return rows

    loaders = {
        "liar": _load_liar_all,
        "fever": _load_fever_all,
        "fakenewsnet": load_fakenewsnet,
        "nela-gt": load_nela_gt,
        "fakeddit": load_fakeddit,
        "genimage": load_genimage,
        "faceforensics": load_faceforensics,
        "asvspoof": load_asvspoof,
    }

    all_rows = []
    for name in args.datasets:
        rows = loaders[name]()
        print(f"{name}: {len(rows)} rows loaded")
        all_rows.extend(rows)

    if not all_rows:
        raise SystemExit("No data loaded — run download_datasets.py first (some datasets require manual download).")

    train, val, test = split_rows(
        all_rows, seed=args.seed, val_ratio=args.val_ratio, test_ratio=args.test_ratio
    )

    os.makedirs(args.output_dir, exist_ok=True)
    for split_name, split in (("train", train), ("val", val), ("test", test)):
        out = os.path.join(args.output_dir, f"{split_name}.jsonl")
        with open(out, "w", encoding="utf-8") as f:
            for row in split:
                if "text" in row:
                    row["text"] = clean_text(row["text"])
                f.write(json.dumps(row) + "\n")
        print(f"{split_name}: {len(split)} rows -> {out}")

    label_counts = {}
    modality_counts = {}
    for row in all_rows:
        label_counts[row["targetLabel"]] = label_counts.get(row["targetLabel"], 0) + 1
        modality_counts[row["modality"]] = modality_counts.get(row["modality"], 0) + 1
    print("target label distribution:", label_counts)
    print("modality distribution:", modality_counts)


if __name__ == "__main__":
    main()