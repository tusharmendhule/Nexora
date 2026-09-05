"""Nexora model inference — CLI, task dispatcher.

Usage:
    python training/predict.py --task text --model-dir <dir> --text "..."
    python training/predict.py --task claim --model-dir <dir> --text "claim..."
    python training/predict.py --task image --model-dir <dir> --image path.jpg
    python training/predict.py --task video --model-dir <dir> --video dir/
    python training/predict.py --task audio --model-dir <dir> --audio file.flac
    python training/predict.py --task multimodal --model-dir <dir> --text "..." --image path.jpg

Output is always probabilistic (prediction, confidence, model, version).
"""

import argparse
import importlib
import sys

TASKS = {
    "text": "predictors.text",
    "claim": "predictors.text",
    "image": "predictors.image",
    "video": "predictors.video",
    "audio": "predictors.audio",
    "multimodal": "predictors.multimodal",
}


def main():
    parser = argparse.ArgumentParser(description="Nexora inference dispatcher")
    parser.add_argument("--task", choices=list(TASKS.keys()), default="text",
                        help="inference task (default: text)")
    args, remaining = parser.parse_known_args()

    module = importlib.import_module(TASKS[args.task])
    sys.argv = [sys.argv[0]] + remaining
    module.main()


if __name__ == "__main__":
    main()