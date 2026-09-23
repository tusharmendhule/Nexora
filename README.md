# Nexora

> **Connect. Share. Verify.**

A full-stack social media platform with a **real AI-powered Trust Score engine** that verifies content using Google Fact Check API, Gemini AI, Google Cloud media APIs (Video Intelligence + Speech-to-Text), and Python ML models — all computed on the backend and displayed in a Flutter frontend.

---

## Table of Contents

- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Trust Score Engine](#trust-score-engine)
- [Google Fact Check Integration](#google-fact-check-integration)
- [Claim Gating & Normalization](#claim-gating--normalization)
- [Source Credibility](#source-credibility)
- [Verification Pipeline](#verification-pipeline)
- [Media Verification (Image / Video / Audio)](#media-verification-image--video--audio)
- [AI Capabilities & Provider Status](#ai-capabilities--provider-status)
- [AI Analysis Service (Python)](#ai-analysis-service-python)
- [Model Training Pipeline](#model-training-pipeline)
- [API Endpoints](#api-endpoints)
- [Environment Variables](#environment-variables)
- [Tech Stack](#tech-stack)
- [Testing](#testing)
- [Key Design Principles](#key-design-principles)
- [License](#license)

---

## Project Structure

```
nexora/
├── backend/                        # Node.js/Express API server
│   ├── src/
│   │   ├── config/                 # Database & Firebase configuration
│   │   ├── controllers/            # Route handlers / business logic
│   │   │   └── v1/                 # V1 API controllers (26 controllers)
│   │   ├── middleware/             # Auth, authorization, age-gate, validation, rate limiting, error handling
│   │   ├── models/                 # Mongoose data models (33 models)
│   │   ├── routes/                 # Legacy v1 API routes
│   │   │   └── v1/                 # V1 API routes (content, analyze, verification, pipeline, …)
│   │   ├── services/               # Core business logic & AI integrations
│   │   │   ├── verification-orchestrator.service.js   # ★ Main orchestrator
│   │   │   ├── pipeline-orchestrator.service.js       # Full pipeline stages
│   │   │   ├── media-verification.service.js          # Image/video/audio verification path
│   │   │   ├── media-claims.service.js                # Media → text/claims extraction
│   │   │   ├── fact-check.service.js                  # Google Fact Check API
│   │   │   ├── claim-classifier.service.js            # Factual-claim gating + normalization
│   │   │   ├── trust-score.service.js                 # Trust Score engine
│   │   │   ├── source-credibility.service.js          # Evidence-derived source credibility
│   │   │   ├── gemini-analysis.service.js             # Gemini AI fallback / claim extraction
│   │   │   ├── evidence-normalization.service.js      # Evidence normalization
│   │   │   ├── claim-entity-extraction.service.js     # Claim extraction
│   │   │   ├── text-analysis.service.js               # Python AI bridge
│   │   │   ├── image-analysis.service.js              # Image analysis
│   │   │   ├── video-analysis.service.js              # Video deepfake detection
│   │   │   ├── audio-analysis.service.js              # Audio analysis
│   │   │   ├── link-analysis.service.js               # Link analysis (SSRF-safe fetch)
│   │   │   ├── google-video-intelligence.service.js   # Cloud Video Intelligence
│   │   │   ├── google-speech.service.js               # Cloud Speech-to-Text
│   │   │   ├── google-cloud-config.service.js         # Google Cloud credential gate
│   │   │   ├── content-router.service.js              # Content-type routing
│   │   │   ├── moderation-decision.service.js         # Publish / reject / review
│   │   │   └── … (auth, post, comment, like, follow, block, message, notification,
│   │       audit, report, story, hashtag, reshare, processing-queue, age-verification)
│   │   ├── ai_service/             # Python FastAPI AI service
│   │   │   ├── app.py              # FastAPI entry point
│   │   │   ├── training/           # Model training pipeline
│   │   │   └── requirements.txt
│   │   ├── utils/                  # Helper functions (AI error mapping, token generation)
│   │   └── app.js                  # Express app entry point
│   ├── test/                       # Jest test suites (826 tests)
│   │   ├── ai/ ai_service/ controllers/ e2e/ integration/ security/ services/ system/
│   ├── .env.example                # Environment variable template
│   └── package.json
├── frontend/                       # Flutter mobile/web/desktop application
│   ├── lib/
│   │   ├── config/                 # API config, themes, Firebase options
│   │   ├── models/                 # Dart data models
│   │   ├── screens/                # UI screens (35 screens)
│   │   ├── services/               # API service layer (25 services)
│   │   ├── utils/                  # Media URL, routing, web image helpers
│   │   ├── widgets/                # Reusable UI components
│   │   └── l10n/                   # Internationalization (7 translation files)
│   ├── android/ ios/ web/ linux/ macos/ windows/
│   ├── test/ integration_test/
│   └── pubspec.yaml
└── docs/
    └── emulator-test/              # Emulator test utilities
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [MongoDB](https://www.mongodb.com/) (local or Atlas)
- [Flutter SDK](https://flutter.dev/docs/get-started/install) (v3.13+)
- [Python 3.10+](https://www.python.org/) (for AI service)

### Backend Setup

```bash
cd backend
cp .env.example .env        # Configure environment variables
npm install
npm run dev                  # Start with hot-reload (nodemon)
```

The API server runs on `http://localhost:5000` by default.

### Historical Data Import

Imports real, dated public-source posts and runs each one through the actual
verification pipeline (claim extraction → Google Fact Check → evidence
normalization → Trust Score → Trust Label). It never generates news: sources
come from archived public sources of record, every record keeps its real
article URL, and trust values are written only by `trust-score.service.js`.

```bash
cd backend
npm run seed:historical -- --fetch   # discover real sources → data/historical/posts.json
npm run seed:historical              # import them through the real pipeline
npm run seed:historical -- --dry-run # validate + report, no writes
npm run seed:historical -- --reset   # remove everything this importer created
```

Notes:

- Discovery is resumable and cached in `data/historical/cache/`; a run
  interrupted by source rate limiting continues where it stopped.
- If the real sources cannot supply the full target, the shortfall is reported
  in the run report. Records are never invented to reach a number.
- Imported posts are owned by clearly-labelled machine accounts
  (`Nexora Seed User 001`…), and seeded likes/comments/saves/reshares are all
  attributable to those accounts.
- Provenance uses existing `Post` fields: `linkUrl` (real article URL),
  `linkTitle`, `linkDescription`, and `createdAt` (real publication date).

### Frontend Setup

```bash
cd frontend
flutter pub get
flutter run                   # Run on connected device/emulator
```

### Physical Phone Setup

The app defaults to `http://10.0.2.2:5000` on Android (emulator only). On a real phone:

1. **In-app Server Address (recommended):** Tap the ⚙ gear icon on the login screen (or **Settings → Developer → Server Address**) and enter the backend host.

2. **USB cable (`adb reverse`):**
   ```bash
   adb reverse tcp:5000 tcp:5000
   ```
   Then set the in-app Server Address to `127.0.0.1`.

3. **Compile-time flag:**
   ```bash
   flutter run --dart-define=API_HOST=192.168.1.50
   ```

### Python AI Service (Optional)

```bash
cd backend/src/ai_service
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

### Google Cloud Media APIs (Optional)

Video and audio analysis can additionally use **Cloud Video Intelligence** and
**Cloud Speech-to-Text**. Enable both APIs in your Google Cloud project, create a
service account, and point `GOOGLE_APPLICATION_CREDENTIALS` (file path) or
`GOOGLE_SERVICE_ACCOUNT_JSON` (inline JSON) at it.

When these credentials are absent, the backend does **not** substitute a
heuristic or invented result — it reports the capability as `UNAVAILABLE` in
`GET /api/v1/content/ai-capabilities` and the signal is simply absent from the
evidence set.

---

## Trust Score Engine

Nexora's Trust Score is **computed entirely on the backend** — never by the client — using a weighted formula:

```
Trust Score = 100 × [ 0.35·Authenticity + 0.35·FactualVerification
                      + 0.20·SourceCredibility + 0.10·ModelConfidence ]
```

| Component | Weight | Source |
|-----------|--------|--------|
| **Authenticity (A)** | 0.35 | Media manipulation detection, AI-generated content signals |
| **Factual Verification (F)** | 0.35 | Google Fact Check API results (PRIMARY), Gemini/Python fallback |
| **Source Credibility (S)** | 0.20 | Evidence-derived signals (fact-check publisher presence, corroboration, link analysis) |
| **Model Confidence (K)** | 0.10 | AI model analysis confidence |

All component scores are normalized between **0.0 and 1.0**, and the raw score is
rounded to an integer from 0–100 (`nexora-trust-v1.0.0`, rules `nexora-rules-v1.0.0`).

### Rule-Based Label Overrides

The raw score feeds into a rule engine that determines the final label
(evaluated in priority order):

| Rule | Condition | Label |
|------|-----------|-------|
| Rule 1 | Confirmed false fact-check | **Red** |
| Rule 2 | High manipulation probability (≥70%) | **Red** |
| Rule 3 | Opinion / satire / edited content | **Purple** |
| Rule 4 | Disclosed AI + supported + score ≥ 70 | **Blue** |
| Rule 5 | High trust (score ≥ 80) | **Green** |
| Rule 6 | Partially verified (40–80) | **Orange** |
| Rule 7 | Low trust (score < 40) | **Red** |

### 5-Tier Label System

| Label | Meaning |
|-------|---------|
| 🟢 **Green** | Verified and authentic — evidence supports the claim |
| 🔵 **Blue** | AI-generated but factually supported |
| 🟣 **Purple** | Opinion, satire, or substantially edited content |
| 🟠 **Orange** | Partially verified — treat with caution |
| 🔴 **Red** | Low credibility — misinformation or manipulation detected |

### Moderation Decision

| Score / signal | Decision |
|----------------|----------|
| ≥ 80 (Green) | Auto-publish |
| ≥ 60 (Blue) | Auto-publish |
| 40–59 (Purple/Orange) | Publish with warning badge |
| < 40 (Red) | Reject |
| Confirmed false fact-check | Reject |
| High manipulation probability | Reject |
| AI service failure | Review required (human escalation) |

---

## Google Fact Check Integration

Google Fact Check Tools API is the **PRIMARY and FIRST** verification method.

### Priority Flow

```
POST / CLAIM
      ↓
CLAIM EXTRACTION (heuristic → Gemini if needed)
      ↓
FACTUAL-CLAIM GATING (claim-classifier: opinions/satire/predictions excluded)
      ↓
GOOGLE FACT CHECK API (FIRST PRIORITY)
      ↓
┌─────┴──────────┐
↓                ↓
SUCCESS          SERVICE ERROR
↓                ↓
USE FACT CHECK   FALLBACK
(NO OTHER        (Gemini → Python)
 PROVIDER)       ↓
↓                ↓
└───────┬────────┘
        ↓
  TRUST SCORE ENGINE
        ↓
    TRUST LABEL
        ↓
     MongoDB
        ↓
    EXISTING UI
```

### Critical Rules

- **Google Fact Check is attempted FIRST** before any fallback
- **When Google Fact Check succeeds, NO other provider runs** — not Gemini, not Python, not any AI model
- **Fallback activates ONLY when the Google Fact Check SERVICE itself fails** (timeout, network error, API error)
- **"No match" from Google Fact Check is NOT treated as an error** — it returns `NO_EVIDENCE` / `UNVERIFIED`
- **No parallel execution** — providers never run simultaneously for the same post
- **No fabricated results** — trust scores are always computed from real analysis

### Fact-Check Rating Mapping

| Google Fact Check Rating | Factual Verification Score |
|--------------------------|---------------------------|
| TRUE / SUPPORTS | 1.0 (high) |
| MOSTLY TRUE | ~0.8 |
| PARTLY TRUE / MIXED | 0.5 (medium) |
| NO MATCH / NO EVIDENCE | 0.5 (neutral) |
| MOSTLY FALSE | ~0.2 |
| FALSE / REFUTES | 0.0 (very low) |

### Caching

- Google Fact Check results are cached in MongoDB for **24 hours**
- Cache key: SHA-256 hash of normalized claim text
- Cached results include publisher, rating, URL, review date
- Expired cache entries are auto-deleted via MongoDB TTL index

---

## Claim Gating & Normalization

`claim-classifier.service.js` decides **which** extracted claims may be sent to
Google Fact Check, and normalizes claim text for querying and caching.

### Claim Types

Each claim is classified as `FACTUAL_CLAIM`, `STATISTICAL_CLAIM`,
`CAUSAL_CLAIM`, `DEFINITION`, `EXPERT_OPINION`, `OPINION`, `SATIRE`,
`PREDICTION`, `MORAL_CLAIM`, `QUESTION`, `PERSONAL_EXPERIENCE`,
`ADVERTISEMENT`, `OTHER`, or `UNKNOWN`.

Only the fact-checkable types (`FACTUAL`, `STATISTICAL`, `CAUSAL`, `DEFINITION`)
are relied on as known-factual. Non-factual types are **never** reported as
factual misinformation. Unclassified claims default to fact-checkable, because a
"no match" outcome maps honestly to `UNVERIFIED`. Claims whose normalized text is
shorter than 4 words are skipped.

Classification is about claim **type**, strictly separate from whether a claim is
true or false.

### Normalization

Before querying or hashing a claim, the service strips URLs, timestamps,
hashtags/mentions, ASR artifacts (`[Music]`, `um`, speaker labels), leading
editorial/CTA labels, and collapses duplicated words/sentences. The **original
claim is always preserved** alongside the normalized form — normalization is for
search and cache keys only.

---

## Source Credibility

`source-credibility.service.js` derives source credibility from **evidence that
was actually observed** — there is no per-domain reputation table. Signals, each
returned with its own weight and value:

| Signal | Weight | Meaning |
|--------|--------|---------|
| `fact_check_publisher_presence` | 0.35 | The claim was reviewed by external, vetted fact-checking publishers |
| `independent_corroboration` | 0.25 | Distinct independent publishers/domains engaged with the claim |
| `source_is_fact_check_publisher` | 0.20 | The content's own host matches a fact-check publisher site |
| `link_analysis_credibility` | 0.20 | Credibility computed by the link-analysis pipeline from real page signals |

The direction of a fact-check (true/false) is **not** used here — source
credibility is kept separate from factuality. When no signal is available the
service returns a neutral `0.5` with `available: false`, so the Trust Score treats
it as missing evidence rather than inventing a value.

---

## Verification Pipeline

The full end-to-end pipeline runs automatically when a post is created. Twelve
tracked stages:

```
USER → POST CREATION → JOB QUEUED
  ↓
CONTENT_UPLOAD
  ↓
CONTENT_TYPE_ROUTING (text/image/video/audio/link)
  ↓
PREPROCESSING (text cleaning, media metadata)
  ↓
AI_ANALYSIS (type-specific: NLP, deepfake, image, audio, link)
  ↓
CLAIM_EXTRACTION (heuristic + Gemini)
  ↓
ENTITY_EXTRACTION (NER)
  ↓
FACT_VERIFICATION (Google Fact Check PRIMARY → Gemini/Python FALLBACK)
  ↓
EVIDENCE_NORMALIZATION (heterogeneous → common format)
  ↓
TRUST_SCORE (backend engine calculation)
  ↓
TRUST_LABEL (rule-based label assignment)
  ↓
MODERATION_DECISION (publish/reject/review)
  ↓
PUBLICATION
  ↓
MongoDB → Flutter UI
```

### Stage Applicability

| Content type | Skipped stages |
|--------------|----------------|
| TEXT / LINK | `CONTENT_UPLOAD` |
| IMAGE / VIDEO / AUDIO | `CONTENT_UPLOAD`, `ENTITY_EXTRACTION` |

Media types still run `CLAIM_EXTRACTION` and `FACT_VERIFICATION`, because
on-screen text and speech transcripts can carry verifiable factual claims.

Stages `CONTENT_TYPE_ROUTING`, `AI_ANALYSIS`, `TRUST_SCORE` and
`MODERATION_DECISION` are **critical** — a failure there fails the pipeline.

### Pipeline Features

- **Background processing** — expensive AI tasks run asynchronously
- **Real verification status** — users see actual analysis progress
- **Graceful degradation** — non-critical stage failures don't block the pipeline
- **Retry with exponential backoff** — transient failures are retried up to 3 times (`1s × 2^retry`)
- **Stage tracking** — each stage logs startedAt, completedAt, durationMs, modelVersion, serviceId, errors
- **Duplicate prevention** — in-memory state prevents re-analysis of the same post

---

## Media Verification (Image / Video / Audio)

`media-verification.service.js` orchestrates the full verification path for media:

```
media → text/claims (Gemini ± Video Intelligence ± Speech-to-Text)
      → claim-type gating (factual claims only)
      → Google Fact Check
      → source credibility
      → Trust Score engine (backend calculation)
      → Trust Label
```

### How media becomes verifiable text

| Modality | Pipeline |
|----------|----------|
| **IMAGE** | Gemini multimodal (OCR + understanding) → claims |
| **VIDEO** | Cloud Video Intelligence (labels, shots, on-screen OCR, object tracking, speech transcription) → Gemini (claims), plus Speech-to-Text for the audio track when available |
| **AUDIO** | Cloud Speech-to-Text (transcript) → Gemini (claims) |

### Authenticity vs. factuality

These are kept strictly separate:

- **Authenticity** — is the media AI-generated or manipulated? (image/video/audio analysis + optional fine-tuned models)
- **Factuality** — is the claim true? (Google Fact Check → Trust Score)

So AI-generated media carrying a verified claim is eligible for **Blue**, while
human media carrying a false claim maps to **Red** via the fact-check override.
Speech transcription itself never substitutes for synthetic-audio detection.

### Honest-by-design

Every provider reports whether it was **actually used**. A provider that is not
configured, or that failed, contributes **no** claims and is recorded as an
unavailable signal — nothing is fabricated. Missing credentials surface as
`available: false` with a machine-readable reason, so the Trust Score can account
for the missing evidence instead of inventing it.

---

## AI Capabilities & Provider Status

`GET /api/v1/content/ai-capabilities` reports which providers and models are
actually configured, so operators never have to guess:

```json
{
  "providers": {
    "googleFactCheck":       { "configured": true,  "role": "primary factual verification" },
    "gemini":                { "configured": true,  "model": "…", "role": "AI reasoning / claim extraction" },
    "googleVideoIntelligence": { "configured": false, "reason": "…", "role": "video frames/shots/OCR/objects/speech" },
    "googleSpeechToText":    { "configured": false, "reason": "…", "role": "audio speech transcription" },
    "pythonAiService":       { "url": "http://127.0.0.1:8000", "role": "NLP and media authenticity models" }
  },
  "googleCloud": { "configured": false, "source": null, "projectId": null, "storageBucket": null, "reason": "…" },
  "models": {
    "misinformation": "facebook/bart-large-mnli (zero-shot)",
    "claimVerification": "not-configured",
    "imageAI": "built-in-heuristics",
    "audioSynthetic": "built-in-spectral",
    "videoManipulation": "built-in-heuristics",
    "aiTextDetection": "gpt2"
  }
}
```

A provider listed as `configured: false` is simply not used, and no substitute
result is fabricated for it.

---

## AI Analysis Service (Python)

A FastAPI service using Hugging Face Transformers for content analysis.

### Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Flutter App │────▶│  Node.js Backend │────▶│  Python AI      │
│  (Frontend)  │     │  (Express API)   │     │  (FastAPI)      │
│              │     │                  │     │  Text + Media   │
└──────────────┘     └──────────────────┘     └─────────────────┘
                            │                         │
                            ▼                         ▼
                     ┌──────────────┐          ┌──────────────┐
                     │   MongoDB    │          │  HuggingFace │
                     │  (Results)   │          │   Models     │
                     └──────────────┘          └──────────────┘
```

### Models Used

| Pipeline | Model | Purpose |
|----------|-------|---------|
| Zero-shot classification | `facebook/bart-large-mnli` | Misinformation probability |
| NER | `dbmdz/bert-large-cased-finetuned-conll03-english` | Named entity extraction |
| AI Detection | `gpt2` | AI-generated text detection (perplexity + burstiness) |
| Language Detection | `langdetect` | Language identification |
| Claim extraction | `spaCy en_core_web_sm` | SVO dependency parsing |
| Image AI detection | `umm-maybe/AI-image-detector` (default, overridable) | AI-generated image probability |
| Video Frame Analysis | `EfficientNet-B0` | Image anomaly detection per frame |
| Face Detection | `MediaPipe` / `OpenCV Haar Cascade` | Face detection in video/image frames |
| Audio Anomaly | Spectral-statistical (librosa) | Synthetic speech indicators |

Models are loaded lazily on first request. If a model cannot be downloaded or
loaded, the service returns an explicit error — it never fabricates results.
Optional fine-tuned Nexora models override the defaults via
`NEXORA_MISINFO_MODEL`, `NEXORA_CLAIM_MODEL`, `NEXORA_IMAGE_MODEL`,
`NEXORA_VIDEO_MODEL`, `NEXORA_AUDIO_MODEL` (see training below).

### Features

1. **Text Preprocessing** — Character/word/sentence counting, whitespace normalization
2. **Language Detection** — Identifies text language with confidence score
3. **Misinformation Classification** — Zero-shot classification (fine-tuned model when configured)
4. **AI-Generated Text Detection** — Perplexity + burstiness analysis under GPT-2
5. **Named Entity Recognition** — BERT-based NER for PERSON, ORG, GPE, etc.
6. **NLP Claim Extraction** — spaCy SVO parsing + zero-shot classification
7. **Entity Extraction** — BERT NER with normalized types
8. **Claim Deduplication** — SHA-256 text hashing for duplicate detection
9. **Fact Verification Integration** — Claims auto-verified against Google Fact Check API
10. **Image Analysis** — Format/metadata validation, face detection, frequency/color/texture anomalies, AI-generated probability
11. **Video Deepfake Detection** — Frame, shot and segment level analysis
12. **Audio Analysis** — Synthetic speech / manipulation indicators
13. **Confidence Scoring** — Composite heuristic based on text quality signals

### API Endpoints

```
POST /analyze/text                    # Text analysis
POST /analyze/claims-entities         # Claim & entity extraction
POST /analyze/image                   # Image manipulation / AI-generation analysis
POST /analyze/video                   # Video deepfake detection
POST /analyze/audio                   # Audio synthetic speech detection
GET  /health                          # Service health check
GET  /                                # Service info
```

`/health` reports which models loaded and which failed, plus the active device
(`cuda` / `cpu`) and a `degraded` status when any model failed.

---

## Model Training Pipeline

Reproducible training using **real labeled benchmark datasets** — never synthetic labels.

### Directory Layout

```
training/
├── download_datasets.py      # Download / validate all real datasets
├── download_from_hf.py       # Pull dataset variants directly from Hugging Face
├── preprocess.py             # Modality-aware cleaning + label normalization + split
├── train.py                  # Task dispatcher (--task text|claim|image|video|audio|multimodal)
├── train_fast.py             # Lightweight single-model training path
├── evaluate.py               # Held-out TEST evaluation (never trained on)
├── predict.py                # CLI inference (probabilistic output)
├── trainers_common.py        # Shared split loading / metadata / label maps
├── tasks/                    # Per-modality trainers
├── evaluators/               # Per-modality evaluators + shared metrics
├── predictors/               # Per-modality CLI inference
├── datasets/                 # Raw downloaded data (gitignored)
├── preprocessed/             # Cleaned splits (gitignored)
├── models/                   # Fine-tuned model outputs (gitignored)
└── evaluation/               # Metric reports (gitignored)
```

### Dataset Matrix

| Dataset | Modality | Labels | Access |
|---------|----------|--------|--------|
| LIAR | text | `true` … `pants-fire` | Direct download (automatic) |
| FEVER | claim | `SUPPORTS`, `REFUTES`, `NOT ENOUGH INFO` | Direct download (automatic) |
| FakeNewsNet | text | `REAL`, `FAKE` | Manual (Twitter/API) |
| NELA-GT | text | `RELIABLE`, `UNRELIABLE`, `MIXED` | Manual (large archives) |
| Fakeddit | multimodal | 6-way label | Manual (Reddit API) |
| GenImage | image | `REAL`, `AI_GENERATED` | Manual (~100GB) |
| FaceForensics++ | video | `REAL`, `MANIPULATED` | Manual (form approval) |
| ASVspoof 2019 LA | audio | `BONA FIDE`, `SPOOF` | Manual (registration) |

### Commands

```bash
cd backend/src/ai_service
pip install -r requirements.txt
pip install -r training/requirements-training.txt

# Download datasets
python training/download_datasets.py --datasets liar fever

# Preprocess
python training/preprocess.py --datasets liar fever --output-dir training/preprocessed

# Train
python training/train.py --task text --data-dir training/preprocessed \
  --model distilbert-base-uncased --output-dir training/models/nexora-text-v1 --epochs 3

# Evaluate (held-out TEST split only)
python training/evaluate.py --task text --model-dir training/models/nexora-text-v1 \
  --data-dir training/preprocessed

# Predict
python training/predict.py --task text --model-dir training/models/nexora-text-v1 \
  --text "Your text here"
```

### Production Model Wiring

| Env var | Task | Replaces |
|---------|------|----------|
| `NEXORA_MISINFO_MODEL` | text | Zero-shot misinformation classification |
| `NEXORA_CLAIM_MODEL` | claim | Per-claim FEVER-style verification |
| `NEXORA_IMAGE_MODEL` | image | `umm-maybe/AI-image-detector` default / heuristic image analysis |
| `NEXORA_VIDEO_MODEL` | video | Frame manipulation heuristics |
| `NEXORA_AUDIO_MODEL` | audio | Spectral synthetic-speech heuristics |

---

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Authenticate user (returns JWT) |
| GET | `/api/auth/me` | Get the authenticated user |
| POST | `/api/v1/auth/register-local` | Register with email + password |
| POST | `/api/v1/auth/login-local` | Email + password login |
| POST | `/api/v1/auth/lookup-email` | Check whether an email is registered |
| POST | `/api/v1/auth/logout` | Log out |
| POST | `/api/otp/send` | Send OTP |
| POST | `/api/otp/verify` | Verify OTP |

Google sign-in uses **Firebase ID tokens** rather than a dedicated route: send the
Firebase ID token as `Authorization: Bearer <token>` and the `protect` middleware
verifies it first, falling back to a JWT.

### Posts & Feed

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/posts` | Get all feed posts (enriched with TrustScore) |
| POST | `/api/posts` | Create a new post (triggers analysis pipeline) |
| GET | `/api/posts/:id` | Get single post by ID |
| GET | `/api/posts/saved` | Get user's saved posts |
| DELETE | `/api/posts/:id` | Delete a post |
| POST | `/api/posts/:id/like` | Toggle like/unlike |
| POST | `/api/posts/:id/comment` | Add comment |
| POST | `/api/posts/:id/save` | Toggle save/bookmark |

### Trust Score & Verification

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/trust-score/:postId` | Calculate trust score for a post |
| GET | `/api/trust-score/:postId` | Get trust score for a post |
| POST | `/api/fact-check/search` | Query Google Fact Check API |
| POST | `/api/v1/verification/fact-check` | Submit claims for verification |
| GET | `/api/v1/verification/:postId` | Get fact-check results for a post |

### Content Analysis Pipeline

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/content/analyze/:postId` | Trigger full analysis pipeline |
| GET | `/api/v1/content/analysis/:postId` | Get stored analysis results |
| GET | `/api/v1/content/jobs/:jobId` | Get job status |
| GET | `/api/v1/content/jobs/post/:postId` | Get all jobs for a post |
| GET | `/api/v1/content/queue/status` | Queue health (admin) |
| GET | `/api/v1/content/ai-capabilities` | Which AI providers/models are configured |

### Direct AI Analysis

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/content/analyze-text` | Direct text analysis |
| GET | `/api/v1/content/analyze-text/:postId` | Stored text analysis by post |
| GET | `/api/v1/content/analyze-text/health` | Python AI service health |
| POST | `/api/v1/content/analyze-image` | Image manipulation analysis |
| POST | `/api/v1/content/analyze-video` | Video deepfake detection |
| POST | `/api/v1/content/analyze-audio` | Audio synthetic speech detection |
| POST | `/api/v1/content/analyze-link` | Link content analysis |
| POST | `/api/v1/content/extract-claims` | Claim & entity extraction |

### Async Media Analysis

Heavy processing runs in the background; the client polls for results.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/analyze/image` | Submit image → `{ jobId }` |
| GET | `/api/v1/analyze/image/:jobId` | Poll image analysis status/results |
| POST | `/api/v1/analyze/video` | Submit video → `{ jobId }` |
| GET | `/api/v1/analyze/video/:jobId` | Poll video analysis status/results |
| POST | `/api/v1/analyze/audio` | Submit audio → `{ jobId }` |
| GET | `/api/v1/analyze/audio/:jobId` | Poll audio analysis status/results |
| POST | `/api/v1/analyze/link` | Submit link → `{ jobId }` |
| GET | `/api/v1/analyze/link/:jobId` | Poll link analysis status/results |
| POST | `/api/v1/analyze/claims-entities` | Submit text for claim/entity extraction |
| GET | `/api/v1/analyze/claims-entities/:jobId` | Poll claim/entity status/results |

### Pipeline Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/pipeline/stages` | List all pipeline stages |
| GET | `/api/v1/pipeline/stats` | Pipeline statistics (admin) |
| GET | `/api/v1/pipeline/:postId` | Current pipeline status for a post |
| GET | `/api/v1/pipeline/:postId/history` | Pipeline run history |
| POST | `/api/v1/pipeline/retry/:postId` | Re-trigger a failed/rejected post |
| POST | `/api/v1/pipeline/verify/:postId` | Trigger verification orchestration |
| GET | `/api/v1/pipeline/verify/:postId` | Current verification state |

### Users & Social

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/me` | Get current user profile |
| GET | `/api/users/:id` | Get user by ID |
| POST | `/api/users/:id/follow` | Follow a user |
| POST | `/api/users/:id/unfollow` | Unfollow a user |
| GET | `/api/users/:id/followers` | List followers |
| GET | `/api/users/:id/following` | List accounts being followed |
| GET | `/api/notifications` | Get notifications |
| GET | `/api/messages` | Get messages |
| POST | `/api/messages` | Send message |
| POST | `/api/reports` | Report content |

### Moderation & Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/moderation/requests` | Request moderator review |
| GET | `/api/v1/moderation/posts` | Flagged post queue |
| GET | `/api/v1/moderation/posts/:id` | Inspect a flagged post |
| POST | `/api/v1/moderation/posts/:id/approve` | Approve a post |
| POST | `/api/v1/moderation/posts/:id/reject` | Reject a post |
| POST | `/api/v1/moderation/posts/:id/override-label` | Override label (ADMIN only) |
| GET | `/api/v1/moderation/logs`, `/stats` | Moderation logs & statistics |
| POST | `/api/v1/admin/users`, `/users/:id/role` | Admin user management |
| GET | `/api/v1/audit/logs`, `/security-summary` | Audit logs & security summary |
| POST | `/api/v1/age-verification/initiate`, `/retry` | Age verification |
| GET | `/api/v1/age-verification/status` | Age verification status |

### Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Get user settings |
| PUT | `/api/settings` | Update settings |
| GET | `/api/v1/settings` | V1 settings |
| PUT | `/api/v1/settings` | Update V1 settings |

---

## Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Server
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000,http://localhost:5000,http://localhost:50775

# Database
MONGO_URI=mongodb+srv://YOUR_MONGODB_URI_HERE

# Authentication
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
JWT_SECRET=YOUR_JWT_SECRET_HERE

# Google Fact Check Tools API (PRIMARY verification)
# Get from: https://developers.google.com/fact-check/tools/api-key
GOOGLE_FACT_CHECK_API_KEY=YOUR_KEY_HERE

# Google Gemini API (fallback verification + claim extraction)
# Get from: https://ai.google.dev/gemini-api/docs/api-key
GEMINI_API_KEY=YOUR_KEY_HERE
GEMINI_MODEL=gemini-2.0-flash

# Cloudinary (media uploads)
CLOUDINARY_CLOUD_NAME=YOUR_CLOUD_NAME
CLOUDINARY_API_KEY=YOUR_API_KEY
CLOUDINARY_API_SECRET=YOUR_API_SECRET

# Google Cloud media APIs (Video Intelligence + Speech-to-Text)
# Required ONLY for the video/audio Cloud signals. When unset, those signals
# are reported as UNAVAILABLE — never replaced by a heuristic or invented value.
GOOGLE_APPLICATION_CREDENTIALS=
GOOGLE_SERVICE_ACCOUNT_JSON=
GOOGLE_CLOUD_PROJECT_ID=
# Optional: bucket for media that must be referenced by a gs:// URI
# (audio > 10MB, video > 20MB)
GOOGLE_CLOUD_STORAGE_BUCKET=

# Python AI Service
AI_SERVICE_URL=http://127.0.0.1:8000

# Age Verification
AGE_VERIFICATION_PROVIDER=mock

# Optional: Python AI service model overrides (see training/)
# NEXORA_MISINFO_MODEL=./src/ai_service/training/models/nexora-text-v1
# NEXORA_CLAIM_MODEL=./src/ai_service/training/models/nexora-claim-v1
# NEXORA_IMAGE_MODEL=./src/ai_service/training/models/nexora-image-v1
# NEXORA_VIDEO_MODEL=./src/ai_service/training/models/nexora-video-v1
# NEXORA_AUDIO_MODEL=./src/ai_service/training/models/nexora-audio-v1
```

**Security:** Never hardcode API keys. Never commit `.env`. API keys stay backend-only.

---

## Tech Stack

### Backend

| Technology | Purpose |
|------------|---------|
| [Express.js](https://expressjs.com/) 5 | Web framework |
| [MongoDB](https://www.mongodb.com/) + [Mongoose](https://mongoosejs.com/) | Database & ODM |
| [JWT](https://jwt.io/) + [Firebase Admin](https://firebase.google.com/docs/auth) | Authentication |
| [bcryptjs](https://github.com/nicolo-ribaudo/bcryptjs) | Password hashing |
| [Axios](https://axios-http.com/) | HTTP client (Google APIs) |
| [Cheerio](https://cheerio.js.org/) | HTML parsing for link analysis |
| [Socket.IO](https://socket.io/) | Real-time messaging |
| [Cloudinary](https://cloudinary.com/) | Media uploads |
| [Multer](https://github.com/expressjs/multer) | Multipart uploads |
| [@google-cloud/video-intelligence](https://cloud.google.com/video-intelligence) | Video frame/shot/OCR/object analysis |
| [@google-cloud/speech](https://cloud.google.com/speech-to-text) | Speech-to-text transcription |
| [@google/generative-ai](https://ai.google.dev/) | Gemini API client |
| [Jest](https://jestjs.io/) | Testing (826 tests) |

### Frontend

| Technology | Purpose |
|------------|---------|
| [Flutter](https://flutter.dev/) | Cross-platform UI (Android, iOS, Web, Desktop) |
| [Dart](https://dart.dev/) | Programming language |
| [Firebase Auth](https://firebase.google.com/docs/auth) + [google_sign_in](https://pub.dev/packages/google_sign_in) | Authentication |
| [shared_preferences](https://pub.dev/packages/shared_preferences) | Local storage |
| [http](https://pub.dev/packages/http) | API communication |
| [socket_io_client](https://pub.dev/packages/socket_io_client) | Real-time messaging |
| [image_picker](https://pub.dev/packages/image_picker) / [video_player](https://pub.dev/packages/video_player) | Media capture & playback |
| [flutter_localizations](https://docs.flutter.dev/ui/accessibility-and-internationalization/internationalization) + [intl](https://pub.dev/packages/intl) | Internationalization |

### AI / ML

| Technology | Purpose |
|------------|---------|
| [FastAPI](https://fastapi.tiangolo.com/) | Python AI service |
| [Hugging Face Transformers](https://huggingface.co/docs/transformers) | NLP models |
| [PyTorch](https://pytorch.org/) | ML framework |
| [spaCy](https://spacy.io/) | NLP pipeline (SVO claim extraction) |
| [OpenCV](https://opencv.org/) | Video/image processing |
| [MediaPipe](https://google.github.io/mediapipe/) | Face detection |
| [librosa](https://librosa.org/) | Audio analysis |

---

## Testing

```bash
cd backend

# Run all tests
npm test

# Run specific test file
npx jest test/services/trust-score.service.test.js --verbose
```

### Test Coverage

- **826 tests** across **32 suites**, all passing
- `test/services/` — 703 tests (trust score, fact check, claim classifier, pipeline orchestrator, evidence normalization, Google media services, …)
- `test/security/` — 47 tests
- `test/integration/` — 21 tests
- `test/controllers/` — 18 tests
- `test/system/` — 17 tests
- `test/ai/` — 13 tests
- `test/e2e/` — 7 tests
- `test/ai_service/` — Python AI service tests
- Frontend: widget tests in `frontend/test/` and Flutter integration tests in `frontend/integration_test/`

---

## Key Design Principles

1. **No fabricated results** — Trust Scores, labels, and explanations are always computed from real analysis
2. **No hardcoded scores** — Every number comes from actual AI/fact-check output; a provider that is unavailable contributes nothing rather than a placeholder
3. **Google Fact Check is primary** — Attempted first; fallback only on service failure
4. **Factual claims only** — Opinion, satire, predictions, questions and ads are excluded from fact-checking
5. **Authenticity ≠ factuality** — Media manipulation detection and claim truth are separate signals
6. **Backend computes everything** — Frontend only displays results
7. **Existing UI unchanged** — Backend changes only affect data, not presentation
8. **Graceful degradation** — Non-critical failures don't block the pipeline
9. **Full audit trail** — Provider used, analysis timestamps, model versions, and evidence are stored

---

## License

This project is private and not licensed for public use.
