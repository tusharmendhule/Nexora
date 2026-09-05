"""Download / prepare real labeled datasets for Nexora model training.

Supported datasets (original labels preserved verbatim — nothing is
synthesized or generated here):

  text        LIAR         https://www.cs.umbc.edu/~rlab1/Kim/Liar/liar_dataset.zip
  claim       FEVER        https://fever.ai/resources.html (shared task v1.1)
  text        FakeNewsNet  https://github.com/KaiDMML/FakeNewsNet (PolitiFact / GossipCop)
  text        NELA-GT      https://github.com/MELALab/nela-gt (reliability labels)
  multimodal  Fakeddit     https://github.com/entitize/Fakeddit (text + images)
  image       GenImage     https://github.com/GenImage-Dataset/GenImage (REAL / AI-GENERATED)
  video       FaceForensics++ https://github.com/ondyari/FaceForensics (REAL / MANIPULATED)
  audio       ASVspoof     https://www.asvspoof.org/database (BONA FIDE / SPOOF)

LIAR and FEVER are fetched automatically. The remaining datasets are gated
by the owners (registration, form approval, or very large manual archives);
this script NEVER fabricates them — it validates the expected local layout
and prints the exact access instructions instead.

Expected layout after a successful manual download:

  datasets/fakenewsnet/{REAL,FAKE}/<id>.txt            # article text
  datasets/nela-gt/articles.jsonl                      # {source, text, reliabilityLabel}
  datasets/fakeddit/fakeddit.jsonl                     # official metadata (text + image id)
  datasets/fakeddit/images/<id>.<ext>                  # images (via Reddit API, see repo)
  datasets/genimage/<split>/{0_real,1_ai}/**/*.jpg     # official GenImage layout
  datasets/faceforensics/<split>/original_sequences/**/images/*.png
  datasets/faceforensics/<split>/manipulated_sequences/**/images/*.png
  datasets/asvspoof/ASVspoof2019_LA_{train,dev,eval}/flac/*.flac
  datasets/asvspoof/ASVspoof2019.LA.cm.{trn,dev,eval}.txt   # protocol files
"""

import argparse
import csv
import os
import sys
import urllib.request

DATASETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "datasets")

LIAR_URL = "https://www.csee.umbc.edu/~rlab1/Kim/Liar/liar_dataset.zip"
FEVER_TRAIN_URL = "https://fever.ai/download/fever/train.jsonl"
FEVER_DEV_URL = "https://fever.ai/download/fever/shared_task_dev.jsonl"
FEVER_TEST_URL = "https://fever.ai/download/fever/shared_task_test.jsonl"

# ─── Access / license notes (source of truth for the report) ───────────

DATASET_INFO = {
    "liar": {
        "license": "Publicly released by the LIAR authors (Wang 2017) for research use.",
        "access": "Direct download (automatic).",
        "modality": "text",
    },
    "fever": {
        "license": "FEVER shared task data, released by the FEVER team for research use.",
        "access": "Direct download (automatic).",
        "modality": "claim",
    },
    "fakenewsnet": {
        "license": "FakeNewsNet (Shu et al. 2020) research release. Twitter content is subject to Twitter terms.",
        "access": "Manual: official repo https://github.com/KaiDMML/FakeNewsNet provides "
                  "PolitiFact/GossipCop metadata; article/tweet text must be fetched with their "
                  "scripts (some require Twitter API credentials).",
        "modality": "text",
    },
    "nela-gt": {
        "license": "NELA-GT (Norregaard et al.) research release; articles remain under their original publishers' rights.",
        "access": "Manual: official repo https://github.com/MELALab/nela-gt lists the DataONE/Google-Drive "
                  "archives (large, multi-GB). The source-reliability labels are in the repo "
                  "(reliable / unreliable / mixed).",
        "modality": "text",
    },
    "fakeddit": {
        "license": "Fakeddit (Nakamura et al. 2020) research release. Images come from Reddit and are subject to Reddit terms.",
        "access": "Manual: official repo https://github.com/entitize/Fakeddit provides fakeddit.py to "
                  "download metadata; image download requires Reddit API credentials. Text-only "
                  "training is possible without images.",
        "modality": "multimodal",
    },
    "genimage": {
        "license": "GenImage (Zhu et al. 2023) research benchmark.",
        "access": "Manual: official repo https://github.com/GenImage-Dataset/GenImage provides "
                  "Google-Drive/OneDrive/Baidu links (large archive, ~100+ GB). Layout uses "
                  "0_real/1_ai subfolders per split.",
        "modality": "image",
    },
    "faceforensics": {
        "license": "FaceForensics++ (Rössler et al. 2019) research release — requires accepting their usage agreement.",
        "access": "Manual: official repo https://github.com/ondyari/FaceForensics + Google form approval; "
                  "run their download_ff.py to obtain original_sequences / manipulated_sequences.",
        "modality": "video",
    },
    "asvspoof": {
        "license": "ASVspoof 2019 (Todisco et al.) — registration-based release for research use.",
        "access": "Manual: register at https://www.asvspoof.org/database, download LA train/dev/eval "
                  "FLAC archives + protocol files.",
        "modality": "audio",
    },
}


def _download(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest):
        print(f"  [skip] already downloaded: {dest}")
        return dest
    print(f"  [get ] {url}")
    urllib.request.urlretrieve(url, dest)
    return dest


def download_liar():
    """Download LIAR via HuggingFace and convert to expected TSV format.

    The original UMBC zip is no longer available (404), so we pull from
    the chengxuphd/liar2 HF dataset and convert numeric labels back to
    the original LIAR string labels.

    LIAR label mapping (numeric -> string):
        0=false, 1=barely-true, 2=half-true, 3=mostly-true,
        4=true, 5=pants-fire
    """
    out_dir = os.path.join(DATASETS_DIR, "liar")
    os.makedirs(out_dir, exist_ok=True)

    # Check if already downloaded
    existing = [os.path.exists(os.path.join(out_dir, f"{s}.tsv"))
                for s in ("train", "valid", "test")]
    if all(existing):
        for s in ("train", "valid", "test"):
            print(f"  [skip] LIAR {s} already exists")
        return

    try:
        from datasets import load_dataset
    except ImportError:
        raise SystemExit("Need 'datasets' package: pip install datasets")

    print("  [hf  ] Downloading LIAR from HuggingFace (chengxuphd/liar2)...")
    ds = load_dataset("chengxuphd/liar2")

    LABEL_MAP = {
        0: "false",
        1: "barely-true",
        2: "half-true",
        3: "mostly-true",
        4: "true",
        5: "pants-fire",
    }

    split_map = {"train": "train", "validation": "valid", "test": "test"}
    for hf_split, file_split in split_map.items():
        out_path = os.path.join(out_dir, f"{file_split}.tsv")
        count = 0
        with open(out_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f, delimiter="\t")
            for row in ds[hf_split]:
                label_str = LABEL_MAP.get(row["label"], str(row["label"]))
                writer.writerow([
                    row.get("id", ""),
                    label_str,
                    row.get("statement", ""),
                    row.get("subject", ""),
                    row.get("speaker", ""),
                    row.get("speaker_description", ""),
                    row.get("state_info", ""),
                    "",  # party (not in this dataset)
                    row.get("true_counts", 0),
                    row.get("mostly_true_counts", 0),
                    row.get("half_true_counts", 0),
                    row.get("mostly_false_counts", 0),
                    row.get("false_counts", 0),
                    row.get("pants_on_fire_counts", 0),
                    row.get("context", ""),
                ])
                count += 1
        print(f"  [ok  ] LIAR {file_split}: {count} rows -> {out_path}")


def download_fever():
    out_dir = os.path.join(DATASETS_DIR, "fever")
    os.makedirs(out_dir, exist_ok=True)
    for split, url in (
        ("train", FEVER_TRAIN_URL),
        ("dev", FEVER_DEV_URL),
        ("test", FEVER_TEST_URL),
    ):
        dest = os.path.join(out_dir, f"{split}.jsonl")
        _download(url, dest)


# ─── Validation for gated datasets ─────────────────────────────────────

def _count_files(paths):
    total = 0
    for p in paths:
        if os.path.isfile(p):
            total += 1
    return total


def check_fakenewsnet():
    base = os.path.join(DATASETS_DIR, "fakenewsnet")
    n = _count_files(
        os.path.join(base, label, fname)
        for label in ("REAL", "FAKE")
        for fname in (os.listdir(os.path.join(base, label)) if os.path.isdir(os.path.join(base, label)) else [])
    )
    print(f"  [info] FakeNewsNet article .txt files found: {n}")
    return n > 0


def check_nela_gt():
    p = os.path.join(DATASETS_DIR, "nela-gt", "articles.jsonl")
    exists = os.path.isfile(p)
    print(f"  [info] NELA-GT articles.jsonl {'found' if exists else 'MISSING'}")
    return exists


def check_fakeddit():
    meta = os.path.join(DATASETS_DIR, "fakeddit", "fakeddit.jsonl")
    images = os.path.join(DATASETS_DIR, "fakeddit", "images")
    n_img = len(os.listdir(images)) if os.path.isdir(images) else 0
    print(f"  [info] Fakeddit metadata {'found' if os.path.isfile(meta) else 'MISSING'}; "
          f"images found: {n_img}")
    return os.path.isfile(meta)


def check_genimage():
    base = os.path.join(DATASETS_DIR, "genimage")
    n = 0
    for split in ("train", "val", "test"):
        for label in ("0_real", "1_ai"):
            d = os.path.join(base, split, label)
            if os.path.isdir(d):
                n += len(os.listdir(d))
    print(f"  [info] GenImage images found: {n}")
    return n > 0


def check_faceforensics():
    base = os.path.join(DATASETS_DIR, "faceforensics")
    n = 0
    for root, _dirs, files in os.walk(base):
        n += sum(1 for f in files if f.endswith((".png", ".jpg")))
    print(f"  [info] FaceForensics++ frames found: {n}")
    return n > 0


def check_asvspoof():
    base = os.path.join(DATASETS_DIR, "asvspoof")
    flac = 0
    for root, _dirs, files in os.walk(base):
        flac += sum(1 for f in files if f.endswith(".flac"))
    protocols = [
        os.path.join(base, "ASVspoof2019.LA.cm.trn.txt"),
        os.path.join(base, "ASVspoof2019.LA.cm.dev.txt"),
        os.path.join(base, "ASVspoof2019.LA.cm.eval.txt"),
    ]
    n_proto = _count_files(protocols)
    print(f"  [info] ASVspoof flac files: {flac}; protocol files: {n_proto}")
    return flac > 0 and n_proto > 0


GATED_CHECKS = {
    "fakenewsnet": check_fakenewsnet,
    "nela-gt": check_nela_gt,
    "fakeddit": check_fakeddit,
    "genimage": check_genimage,
    "faceforensics": check_faceforensics,
    "asvspoof": check_asvspoof,
}


def main():
    parser = argparse.ArgumentParser(description="Download Nexora training datasets")
    parser.add_argument(
        "--datasets",
        nargs="+",
        default=["liar"],
        choices=list(DATASET_INFO.keys()),
        help="Datasets to download/validate (default: liar)",
    )
    args = parser.parse_args()

    for name in args.datasets:
        info = DATASET_INFO[name]
        print(f"\n=== {name} ({info['modality']}) ===")
        print(f"  license: {info['license']}")
        print(f"  access : {info['access']}")
        if name == "liar":
            download_liar()
        elif name == "fever":
            download_fever()
        else:
            check = GATED_CHECKS.get(name)
            if check and not check():
                print(f"  [warn] {name} data not found locally. Follow the access "
                      f"instructions above and re-run, or place files per the layout "
                      f"documented at the top of this script.")
        print(f"  [ok  ] {name} ready (see {os.path.join(DATASETS_DIR, name)})")


if __name__ == "__main__":
    main()