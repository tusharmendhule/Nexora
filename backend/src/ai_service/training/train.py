"""Nexora model training — task dispatcher.

Usage:
    python training/train.py --task text --data-dir training/preprocessed ...
    python training/train.py --task claim --data-dir training/preprocessed ...
    python training/train.py --task image --data-dir training/preprocessed ...
    python training/train.py --task video --data-dir training/preprocessed ...
    python training/train.py --task audio --data-dir training/preprocessed ...
    python training/train.py --task multimodal --data-dir training/preprocessed ...

Default task is `text` (backward compatible with previous CLI usage).
Each task's trainer module owns its remaining flags (see --help).
"""

import argparse
import importlib
import sys

TASKS = {
    "text": "tasks.text",
    "claim": "tasks.text",
    "image": "tasks.image",
    "video": "tasks.video",
    "audio": "tasks.audio",
    "multimodal": "tasks.multimodal",
}


def main():
    parser = argparse.ArgumentParser(description="Nexora training dispatcher")
    parser.add_argument("--task", choices=list(TASKS.keys()), default="text",
                        help="training task (default: text)")
    args, remaining = parser.parse_known_args()

    module = importlib.import_module(TASKS[args.task])
    # Re-inject --task-free argv into the task module's own parser.
    sys.argv = [sys.argv[0]] + remaining
    module.main()


if __name__ == "__main__":
    main()