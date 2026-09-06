# Nexora

> **Connect. Share. Verify.**

A full-stack social media platform with a **real AI-powered Trust Score engine** that verifies content using Google Fact Check API, Gemini AI, and Python ML models — all computed on the backend and displayed in a Flutter frontend.

---

## Table of Contents

- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Trust Score Engine](#trust-score-engine)
- [Google Fact Check Integration](#google-fact-check-integration)
- [Verification Pipeline](#verification-pipeline)
- [AI Analysis Service (Python)](#ai-analysis-service-python)
- [Model Training Pipeline](#model-training-pipeline)
- [API Endpoints](#api-endpoints)
- [Environment Variables](#environment-variables)
- [Tech Stack](#tech-stack)
- [License](#license)

---

## Project Structure

```
nexora/
├── backend/                        # Node.js/Express API server
│   ├── src/
│   │   ├── config/                 # Database & app configuration
│   │   ├── controllers/            # Route handlers / business logic
│   │   │   └── v1/                 # V1 API controllers
│   │   ├── middleware/              # Auth, validation, error handling
│   │   ├── models/                 # Mongoose data models (33 models)
│   │   ├── routes/                 # API route definitions
│   │   │   └── v1/                 # V1 API routes
│   │   ├── services/               # Core business logic & AI integrations
│   │   │   ├── verification-orchestrator.service.js   # ★ Main orchestrator
│   │   │   ├── pipeline-orchestrator.service.js       # Full pipeline stages
│   │   │   ├── fact-check.service.js                  # Google Fact Check API
│   │   │   ├── trust-score.service.js                 # Trust Score engine
│   │   │   ├── gemini-analysis.service.js             # Gemini AI fallback
│   │   │   ├── evidence-normalization.service.js      # Evidence normalization
│   │   │   ├── claim-entity-extraction.service.js     # Claim extraction
│   │   │   ├── text-analysis.service.js               # Python AI bridge
│   │   │   ├── image-analysis.service.js              # Image analysis
│   │   │   ├── video-analysis.service.js              # Video deepfake detection
│   │   │   ├── audio-analysis.service.js              # Audio analysis
│   │   │   └── link-analysis.service.js               # Link analysis
│   │   ├── ai_service/             # Python FastAPI AI service
│   │   │   ├── app.py              # FastAPI entry point
│   │   │   ├── training/           # Model training pipeline
│   │   │   └── requirements.txt
│   │   ├── utils/                  # Helper functions
│   │   └── app.js                  # Express app entry point
│   ├── test/                       # Jest test suites (790 tests)
│   ├── .env.example                # Environment variable template
│   └── package.json
├── frontend/                       # Flutter mobile/web application
│   ├── lib/
│   │   ├── config/                 # App configuration & themes
│   │   ├── models/                 # Dart data models
│   │   ├── screens/                # UI screens (35+ screens)
│   │   ├── services/               # API service layer
│   │   ├── widgets/                # Reusable UI components
│   │   └── l10n/                   # Internationalization
│   ├── android/
│   ├── ios/
│   ├── web/
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
| **Source Credibility (S)** | 0.20 | Publisher reputation, fact-check source reliability |
| **Model Confidence (K)** | 0.10 | AI model analysis confidence |

All component scores are normalized between **0.0 and 1.0**.

### Rule-Based Label Overrides

The raw score feeds into a rule engine that determines the final label:

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

---

## Google Fact Check Integration

Google Fact Check Tools API is the **PRIMARY and FIRST** verification method.

### Priority Flow

```
POST / CLAIM
      ↓
CLAIM EXTRACTION (heuristic → Gemini if needed)
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

## Verification Pipeline

The full end-to-end pipeline runs automatically when a post is created:

```
USER → POST CREATION → JOB QUEUED
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

### Pipeline Features

- **Background processing** — expensive AI tasks run asynchronously
- **Real verification status** — users see actual analysis progress
- **Graceful degradation** — non-critical stage failures don't block the pipeline
- **Retry with exponential backoff** — transient failures are retried up to 3 times
- **Stage tracking** — each stage logs startedAt, completedAt, durationMs, errors
- **Duplicate prevention** — in-memory state prevents re-analysis of the same post

---

## AI Analysis Service (Python)

A FastAPI service using Hugging Face Transformers for content analysis.

### Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Flutter App │────▶│  Node.js Backend │────▶│  Python AI      │
│  (Frontend)  │     │  (Express API)   │     │  (FastAPI)      │
│              │     │                  │     │  Text + Video   │
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
| Video Frame Analysis | `EfficientNet-B0` | Image anomaly detection per frame |
| Face Detection | `MediaPipe` / `OpenCV Haar Cascade` | Face detection in video frames |

### Features

1. **Text Preprocessing** — Character/word/sentence counting, whitespace normalization
2. **Language Detection** — Identifies text language with confidence score
3. **Misinformation Classification** — Zero-shot classification into 5 categories
4. **AI-Generated Text Detection** — Perplexity + burstiness analysis under GPT-2
5. **Named Entity Recognition** — BERT-based NER for PERSON, ORG, GPE, etc.
6. **NLP Claim Extraction** — spaCy SVO parsing + zero-shot classification
7. **Entity Extraction** — BERT NER with normalized types
8. **Claim Deduplication** — SHA-256 text hashing for duplicate detection
9. **Fact Verification Integration** — Claims auto-verified against Google Fact Check API
10. **Confidence Scoring** — Composite heuristic based on text quality signals

### API Endpoints

```
POST /analyze/text                    # Text analysis
POST /analyze/video                   # Video deepfake detection
POST /analyze/claims-entities         # Claim & entity extraction
GET  /health                          # Service health check
```

---

## Model Training Pipeline

Reproducible training using **real labeled benchmark datasets** — never synthetic labels.

### Directory Layout

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
├── preprocessed/          # Cleaned splits (gitignored)
├── models/                # Fine-tuned model outputs (gitignored)
└── evaluation/            # Metric reports (gitignored)
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
| `NEXORA_IMAGE_MODEL` | image | Heuristic image analysis |
| `NEXORA_VIDEO_MODEL` | video | Frame manipulation heuristics |
| `NEXORA_AUDIO_MODEL` | audio | Spectral synthetic-speech heuristics |

---

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Authenticate user |
| POST | `/api/auth/firebase` | Firebase authentication |
| POST | `/api/otp/send` | Send OTP |
| POST | `/api/otp/verify` | Verify OTP |

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

### Direct AI Analysis

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/content/analyze-text` | Direct text analysis |
| POST | `/api/v1/content/analyze-video` | Video deepfake detection |
| POST | `/api/v1/content/analyze-image` | Image manipulation analysis |
| POST | `/api/v1/content/analyze-audio` | Audio synthetic speech detection |
| POST | `/api/v1/content/analyze-link` | Link content analysis |
| POST | `/api/v1/content/extract-claims` | Claim & entity extraction |

### Users & Social

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/me` | Get current user profile |
| GET | `/api/users/:id` | Get user by ID |
| POST | `/api/follow/:id` | Follow/unfollow user |
| GET | `/api/notifications` | Get notifications |
| GET | `/api/messages` | Get messages |
| POST | `/api/messages` | Send message |
| POST | `/api/reports` | Report content |

### Moderation & Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/moderation/requests` | Request moderator review |
| GET | `/api/v1/moderation` | Get moderation queue |
| POST | `/api/v1/moderation/decide` | Moderator decision |
| GET | `/api/v1/admin/*` | Admin endpoints |
| GET | `/api/v1/audit/*` | Audit logs |

### Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Get user settings |
| PATCH | `/api/settings` | Update settings |
| GET | `/api/v1/settings` | V1 settings |

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
# Get from: https://console.cloud.google.com/apis/library/factchecktools.googleapis.com
GOOGLE_FACT_CHECK_API_KEY=YOUR_KEY_HERE

# Google Gemini API (fallback verification)
# Get from: https://ai.google.dev/gemini-api/docs/api-key
GEMINI_API_KEY=YOUR_KEY_HERE
GEMINI_MODEL=gemini-2.0-flash

# Cloudinary (media uploads)
CLOUDINARY_CLOUD_NAME=YOUR_CLOUD_NAME
CLOUDINARY_API_KEY=YOUR_API_KEY
CLOUDINARY_API_SECRET=YOUR_API_SECRET

# Python AI Service
AI_SERVICE_URL=http://127.0.0.1:8000

# Age Verification
AGE_VERIFICATION_PROVIDER=mock

# Optional: Fine-tuned models (see training/)
# NEXORA_MISINFO_MODEL=backend/src/ai_service/training/models/nexora-fakenews-distilbert
# NEXORA_CLAIM_MODEL=backend/src/ai_service/training/models/nexora-claim-v1
# NEXORA_IMAGE_MODEL=backend/src/ai_service/training/models/nexora-image-v1
# NEXORA_VIDEO_MODEL=backend/src/ai_service/training/models/nexora-video-v1
# NEXORA_AUDIO_MODEL=backend/src/ai_service/training/models/nexora-audio-v1
```

**Security:** Never hardcode API keys. Never commit `.env`. API keys stay backend-only.

---

## Tech Stack

### Backend

| Technology | Purpose |
|------------|---------|
| [Express.js](https://expressjs.com/) | Web framework |
| [MongoDB](https://www.mongodb.com/) + [Mongoose](https://mongoosejs.com/) | Database & ODM |
| [JWT](https://jwt.io/) + [Firebase Auth](https://firebase.google.com/docs/auth) | Authentication |
| [bcryptjs](https://github.com/nicolo-ribaudo/bcryptjs) | Password hashing |
| [Axios](https://axios-http.com/) | HTTP client (Google APIs) |
| [Socket.IO](https://socket.io/) | Real-time messaging |
| [Cloudinary](https://cloudinary.com/) | Media uploads |
| [Jest](https://jestjs.io/) | Testing (790 tests) |

### Frontend

| Technology | Purpose |
|------------|---------|
| [Flutter](https://flutter.dev/) | Cross-platform UI (Android, iOS, Web, Desktop) |
| [Dart](https://dart.dev/) | Programming language |
| [Firebase Auth](https://firebase.google.com/docs/auth) | Authentication |
| [shared_preferences](https://pub.dev/packages/shared_preferences) | Local storage |
| [http](https://pub.dev/packages/http) | API communication |

### AI / ML

| Technology | Purpose |
|------------|---------|
| [FastAPI](https://fastapi.tiangolo.com/) | Python AI service |
| [Hugging Face Transformers](https://huggingface.co/docs/transformers) | NLP models |
| [PyTorch](https://pytorch.org/) | ML framework |
| [spaCy](https://spacy.io/) | NLP pipeline |
| [OpenCV](https://opencv.org/) | Video/image processing |
| [MediaPipe](https://google.github.io/mediapipe/) | Face detection |

---

## Testing

```bash
cd backend

# Run all tests
npm test

# Run specific test file
npx jest test/services/trust-score.test.js --verbose
```

### Test Coverage

- **790 tests** across 30 test suites
- Unit tests for all services (trust score, fact check, evidence, etc.)
- Integration tests for API endpoints
- Pipeline orchestration tests
- Security tests
- Edge case handling

---

## Key Design Principles

1. **No fabricated results** — Trust Scores, labels, and explanations are always computed from real analysis
2. **No hardcoded scores** — Every number comes from actual AI/fact-check output
3. **Google Fact Check is primary** — Attempted first; fallback only on service failure
4. **Backend computes everything** — Frontend only displays results
5. **Existing UI unchanged** — Backend changes only affect data, not presentation
6. **Graceful degradation** — Non-critical failures don't block the pipeline
7. **Full audit trail** — Provider used, analysis timestamps, and evidence are stored

---

## License

This project is private and not licensed for public use.
