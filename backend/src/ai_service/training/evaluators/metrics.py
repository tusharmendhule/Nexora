"""Shared evaluation metrics for all Nexora tasks.

Only numbers produced by these functions may be cited as model performance.
Every report keeps {dataset, originalLabel, modelPrediction, modelConfidence}
per row — original labels are never overwritten by predictions.
"""

import json
import os

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    precision_recall_fscore_support,
    roc_auc_score,
)


def compute_metrics(y_true, y_pred, probabilities, label_list):
    """Compute accuracy, macro precision/recall/F1, confusion matrix, ROC-AUC."""
    labels = list(range(len(label_list)))
    acc = accuracy_score(y_true, y_pred)
    report = classification_report(
        y_true, y_pred, labels=labels, target_names=label_list,
        output_dict=True, zero_division=0,
    )
    cm = confusion_matrix(y_true, y_pred, labels=labels).tolist()
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_true, y_pred, labels=labels, average="macro", zero_division=0
    )

    roc_auc = None
    if probabilities is not None and len(set(y_true)) > 1:
        try:
            roc_auc = roc_auc_score(
                np.eye(len(label_list))[y_true], np.array(probabilities),
                multi_class="ovr", average="macro",
            )
        except Exception as exc:
            print(f"  [warn] ROC-AUC skipped: {exc}")

    return {
        "test_rows": len(y_true),
        "accuracy": round(float(acc), 4),
        "macro_precision": round(float(precision), 4),
        "macro_recall": round(float(recall), 4),
        "macro_f1": round(float(f1), 4),
        "roc_auc_macro": round(float(roc_auc), 4) if roc_auc is not None else None,
        "classification_report": report,
        "confusion_matrix": cm,
        "labels": label_list,
    }


def write_report(output, result, per_row):
    os.makedirs(os.path.dirname(output), exist_ok=True)
    with open(output, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
    per_row_path = os.path.join(os.path.dirname(output), "per_row_predictions.jsonl")
    with open(per_row_path, "w", encoding="utf-8") as f:
        for row in per_row:
            f.write(json.dumps(row) + "\n")
    print(f"\n=== Held-out TEST evaluation ===")
    print(f"rows: {result['test_rows']}")
    print(f"accuracy:        {result['accuracy']}")
    print(f"macro precision: {result['macro_precision']}")
    print(f"macro recall:    {result['macro_recall']}")
    print(f"macro F1:        {result['macro_f1']}")
    if result.get("roc_auc_macro") is not None:
        print(f"ROC-AUC (macro): {result['roc_auc_macro']}")
    print(f"Report saved to {output}")


def load_label_map(model_dir):
    with open(os.path.join(model_dir, "label_map.json")) as f:
        label_to_index = json.load(f)
    index_to_label = {int(v): k for k, v in label_to_index.items()}
    label_list = [index_to_label[i] for i in sorted(index_to_label)]
    return label_to_index, index_to_label, label_list


def per_row_records(rows, y_pred, probabilities, index_to_label):
    per_row = []
    for r, pred, probs in zip(rows, y_pred, probabilities):
        per_row.append({
            "dataset": r.get("dataset"),
            "originalLabel": r.get("originalLabel"),
            "modelPrediction": index_to_label[pred],
            "modelConfidence": round(float(max(probs)), 4),
        })
    return per_row