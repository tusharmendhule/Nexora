"""Download LIAR and FEVER from HuggingFace datasets and convert to expected formats.

LIAR -> datasets/liar/{train,valid,test}.tsv
FEVER -> datasets/fever/{train,dev,test}.jsonl
"""

import csv
import json
import os
import sys

DATASETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "datasets")


def download_liar():
    """Download LIAR from HuggingFace and convert to TSV."""
    from datasets import load_dataset

    print("Downloading LIAR from HuggingFace...")
    ds = load_dataset("ucirvine/liar", trust_remote_code=True)
    out_dir = os.path.join(DATASETS_DIR, "liar")
    os.makedirs(out_dir, exist_ok=True)

    # LIAR HF columns: id, label, statement, subject, speaker, speaker_title,
    # state, party, barely_true_counts, false_counts, half_true_counts,
    # mostly_true_counts, pants_on_fire_counts, context

    split_map = {"train": "train", "validation": "valid", "test": "test"}
    for hf_split, file_split in split_map.items():
        out_path = os.path.join(out_dir, f"{file_split}.tsv")
        with open(out_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f, delimiter="\t")
            count = 0
            for row in ds[hf_split]:
                # Original LIAR TSV format (13 columns):
                # 0:id 1:label 2:statement 3:subject 4:speaker 5:speaker_title
                # 6:state 7:party 8:barely_true_counts 9:false_counts
                # 10:half_true_counts 11:mostly_true_counts 12:pants_on_fire_counts 13:context
                label = row["label"]  # already a string like "true", "false", etc.
                writer.writerow([
                    row.get("id", ""),
                    label,
                    row.get("statement", ""),
                    row.get("subject", ""),
                    row.get("speaker", ""),
                    row.get("speaker_job_title", row.get("speaker_title", "")),
                    row.get("state_info", row.get("state", "")),
                    row.get("party", ""),
                    row.get("barely_true_counts", 0),
                    row.get("false_counts", 0),
                    row.get("half_true_counts", 0),
                    row.get("mostly_true_counts", 0),
                    row.get("pants_on_fire_counts", 0),
                    row.get("context", ""),
                ])
                count += 1
        print(f"  LIAR {file_split}: {count} rows -> {out_path}")


def download_fever():
    """Download FEVER from HuggingFace and convert to JSONL."""
    from datasets import load_dataset

    print("Downloading FEVER from HuggingFace...")
    ds = load_dataset("fever/fever", trust_remote_code=True)
    out_dir = os.path.join(DATASETS_DIR, "fever")
    os.makedirs(out_dir, exist_ok=True)

    # FEVER HF: train, labeled_dev, test
    split_map = {"train": "train", "labeled_dev": "dev", "test": "test"}
    for hf_split, file_split in split_map.items():
        out_path = os.path.join(out_dir, f"{file_split}.jsonl")
        count = 0
        with open(out_path, "w", encoding="utf-8") as f:
            for row in ds[hf_split]:
                obj = {
                    "id": row.get("id", count),
                    "label": row.get("label", row.get("verdict", "")),
                    "claim": row.get("claim", ""),
                }
                f.write(json.dumps(obj) + "\n")
                count += 1
        print(f"  FEVER {file_split}: {count} rows -> {out_path}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--datasets", nargs="+", default=["liar", "fever"],
                        choices=["liar", "fever"])
    args = parser.parse_args()

    if "liar" in args.datasets:
        download_liar()
    if "fever" in args.datasets:
        download_fever()

    print("\nDone! Now run preprocess.py to create splits.")
