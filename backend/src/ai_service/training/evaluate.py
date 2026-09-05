"""Nexora model evaluation — held-out TEST split, task dispatcher.

Usage:
    python training/evaluate.py --task text --model-dir <dir> --data-dir training/preprocessed ...
    python training/evaluate.py --task claim --model-dir <dir> ...
    python training/evaluate.py --task image --model-dir <dir> ...
    python training/evaluate.py --task video --model-dir <dir> ...
    python training/evaluate.py --task audio --model-dir <dir> ...
    python training/evaluate.py --task multimodal --model-dir <dir> ...

Reports accuracy, precision, recall, F1, confusion matrix and (macro)
ROC-AUC where meaningful, plus per-row {dataset, originalLabel,
modelPrediction, modelConfidence} for every task.
"""

import argparse
import importlib
import sys

TASKS = {
    "text": "evaluators.text",
    "claim": "evaluators.text",
    "image": "evaluators.image",
    "video": "evaluators.video",
    "audio": "evaluators.audio",
    "multimodal": "evaluators.multimodal",
}


def main():
    parser = argparse.ArgumentParser(description="Nexora evaluation dispatcher")
    parser.add_argument("--task", choices=list(TASKS.keys()), default="text",
                        help="evaluation task (default: text)")
    args, remaining = parser.parse_known_args()

    module = importlib.import_module(TASKS[args.task])
    sys.argv = [sys.argv[0]] + remaining
    module.main()


if __name__ == "__main__":
    main()