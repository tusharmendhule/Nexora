# Nexora Model Training Pipeline

Reproducible training for every Nexora AI signal, using REAL labeled
benchmark datasets — never synthetic labels manufactured by an LLM.

## Directory Layout

```
training/
├── download_datasets.py   # Download / validate all 7 real datasets
├── preprocess.py          # Modality-aware cleaning + label normalization + split
├── train.py               # Task dispatcher (--task text|claim|image|video|audio|multimodal)
├── evaluate.py            # Held-out TEST evaluation (never trained on)
├── predict.py             # CLI inference (probabilistic output)
├── trainers_common.py     # Shared split loading / metadata / label maps
├── tasks/                 # Per-modality trainers
├── evaluators/            # Per-modality evaluators + shared metrics
├── predictors/            # Per-modality CLI inference
├── datasets/              # Raw downloaded data (gitignored)
├── preprocessed/          # Cleaned splits, originalLabel preserved (gitignored)
├── models/                # Fine-tuned model outputs (gitignored)
└── evaluation/            # Metric reports (gitignored)
```

## Dataset Matrix

| Dataset | Modality | Original labels (preserved) | Access |
|---|---|---|---|
| LIAR | text | `true` … `pants-fire` | Direct download (automatic) |
| FEVER | claim | `SUPPORTS`, `REFUTES`, `NOT ENOUGH INFO` | Direct download (automatic) |
| FakeNewsNet (PolitiFact/GossipCop) | text | `REAL`, `FAKE` | Manual article fetch (Twitter/API) |
| NELA-GT | text | `RELIABLE`, `UNRELIABLE`, `MIXED` | Manual (large archives, DataONE/Drive) |
| Fakeddit | multimodal | 6-way `label` (2-way target documented) | Manual (metadata + Reddit API images) |
| GenImage | image | `REAL`, `AI_GENERATED` | Manual (Google Drive/OneDrive, ~100GB) |
| FaceForensics++ | video | `REAL`, `MANIPULATED` | Manual (form approval + download_ff.py) |
| ASVspoof 2019 LA | audio | `BONA FIDE`, `SPOOF` | Manual (registration at asvspoof.org) |

`originalLabel` is always stored next to the model prediction
(`dataset`, `originalLabel`, `modelPrediction`, `modelConfidence`).
The model prediction NEVER overwrites the original label.

### Licenses / access requirements

- **LIAR** — publicly released by the authors for research use; direct zip.
- **FEVER** — released for the shared task; direct JSONL download.
- **FakeNewsNet** — research release; article/tweet text requires their fetch
  scripts and possibly Twitter API credentials (Twitter content is subject to
  Twitter terms).
- **NELA-GT** — research release; articles remain under their original
  publishers' rights; multi-GB archives from DataONE / Google Drive.
- **Fakeddit** — research release; images come from Reddit and require Reddit
  API credentials. Text-only training works without images.
- **GenImage** — research benchmark; requires accepting the authors' download
  terms (Google Drive / OneDrive / Baidu, ~100+ GB).
- **FaceForensics++** — requires agreeing to the authors' usage terms via
  Google form, then running their `download_ff.py`.
- **ASVspoof** — registration-based release for research use.

Run `python training/download_datasets.py --datasets <name>` for exact
instructions per dataset. LIAR/FEVER download automatically; the rest print
the expected local layout and validate what is present. Nothing is ever
synthesized to fill a gap.

## Commands

```bash
cd backend/src/ai_service
pip install -r requirements.txt
pip install -r training/requirements-training.txt

# 1. Datasets (auto: liar fever; manual: others — see downloader output)
python training/download_datasets.py --datasets liar fever

# 2. Preprocess (per task group — never mix modalities in one split)
python training/preprocess.py --datasets liar fever --output-dir training/preprocessed
python training/preprocess.py --datasets genimage --output-dir training/preprocessed-image
python training/preprocess.py --datasets faceforensics --output-dir training/preprocessed-video
python training/preprocess.py --datasets asvspoof --output-dir training/preprocessed-audio
python training/preprocess.py --datasets fakeddit --output-dir training/preprocessed-multimodal

# 3. Train
python training/train.py --task text --data-dir training/preprocessed \
  --model distilbert-base-uncased --output-dir training/models/nexora-text-v1 --epochs 3
python training/train.py --task claim --data-dir training/preprocessed \
  --model roberta-base --output-dir training/models/nexora-claim-v1 --epochs 3
python training/train.py --task image --data-dir training/preprocessed-image \
  --model google/vit-base-patch16-224 --output-dir training/models/nexora-image-v1 --epochs 5
python training/train.py --task video --data-dir training/preprocessed-video \
  --model google/vit-base-patch16-224 --output-dir training/models/nexora-video-v1 --epochs 5
python training/train.py --task audio --data-dir training/preprocessed-audio \
  --model facebook/wav2vec2-base --output-dir training/models/nexora-audio-v1 --epochs 5
python training/train.py --task multimodal --data-dir training/preprocessed-multimodal \
  --output-dir training/models/nexora-multimodal-v1 --epochs 3

# 4. Evaluate on the held-out TEST split
python training/evaluate.py --task text  --model-dir training/models/nexora-text-v1  --data-dir training/preprocessed
python training/evaluate.py --task image --model-dir training/models/nexora-image-v1 --data-dir training/preprocessed-image
# ... same pattern for claim/video/audio/multimodal

# 5. Predict (probabilistic output)
python training/predict.py --task text  --model-dir training/models/nexora-text-v1  --text "..."
python training/predict.py --task image --model-dir training/models/nexora-image-v1 --image path.jpg
python training/predict.py --task video --model-dir training/models/nexora-video-v1 --video frames_dir/
python training/predict.py --task audio --model-dir training/models/nexora-audio-v1 --audio file.flac
python training/predict.py --task multimodal --model-dir training/models/nexora-multimodal-v1 --text "..." --image path.jpg
```

The TEST split is created before tokenization and never used during training
or hyperparameter selection — no data leakage. Video evaluation uses
per-video majority vote over ALL test frames (a single suspicious frame can
never decide a verdict; ties are excluded and reported as uncertain).

## Model Output

`train.py` saves (per task) into `--output-dir`:

- HF-format model + tokenizer/processor (`pytorch_model.bin`, `config.json`, …)
- `label_map.json` — target label → index
- `model_meta.json` — model name, version, base model, dataset size, seed,
  **validation** metrics (never test metrics)
- `training_history.json` — per-epoch loss/accuracy

Example structured inference output:

```json
{
  "prediction": "REFUTES",
  "confidence": 0.94,
  "probabilities": {"SUPPORTS": 0.02, "REFUTES": 0.94, "NOT_ENOUGH_INFO": 0.04},
  "model": "nexora-text-classifier",
  "version": "1.0.0",
  "note": "Probabilistic estimate — not absolute certainty."
}
```

Bump `MODEL_VERSION` in each `tasks/<task>.py` whenever the architecture,
dataset, or training procedure changes.

## Evaluation Metrics

`evaluate.py` reports on the held-out TEST set: accuracy, precision, recall,
F1 (macro), confusion matrix, and ROC-AUC (macro) where meaningful, plus
per-row `{dataset, originalLabel, modelPrediction, modelConfidence}`.
Only numbers produced here may be cited. Never invent accuracy figures.

## Production Wiring

The FastAPI service loads a fine-tuned model per task via env vars
(same lazy-load pattern; unset/unloadable → built-in fallback, reported
honestly, never fabricated):

| Env var | Task | Replaces |
|---|---|---|
| `NEXORA_MISINFO_MODEL` | text | zero-shot misinformation classification |
| `NEXORA_CLAIM_MODEL` | claim | per-claim FEVER-style verification |
| `NEXORA_IMAGE_MODEL` | image | heuristic image analysis (supplement) |
| `NEXORA_VIDEO_MODEL` | video | frame manipulation heuristics (blended) |
| `NEXORA_AUDIO_MODEL` | audio | spectral synthetic-speech heuristics |

```bash
NEXORA_IMAGE_MODEL=training/models/nexora-image-v1 \
NEXORA_AUDIO_MODEL=training/models/nexora-audio-v1 \
  python -m uvicorn app:app --host 0.0.0.0 --port 8000
```

## Important Semantics

- **AI-generated ≠ false.** Image/audio/video detectors output AUTHENTICITY
  signals only. The trust engine keeps authenticity separate from factuality
  (an AI-generated image with a verified claim is BLUE, not RED).
- **AI detection is probabilistic.** Detectors report probabilities and
  confidence, never "100% AI" / "100% human".
- **Source reliability ≠ claim truth.** NELA-GT trains S(C); it is never
  used to declare an individual article true or false.