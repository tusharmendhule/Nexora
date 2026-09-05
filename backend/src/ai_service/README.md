# Nexora AI Analysis Service

Real-time content analysis using Hugging Face Transformers for text (misinformation, AI-generated text, NER, claims) and video deepfake/manipulation detection.

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Flutter App │────▶│  Node.js Backend │────▶│  Python AI  │
│  (Frontend)  │     │  (Express API)   │     │  (FastAPI)  │
│              │     │                  │     │  Text + Video│
└──────────────┘     └──────────────────┘     └─────────────┘
                            │                         │
                            ▼                         ▼
                     ┌──────────────┐          ┌──────────────┐
                     │   MongoDB    │          │  HuggingFace │
                     │  (Results)   │          │   Models     │
                     └──────────────┘          └──────────────┘
```

## Models Used

| Pipeline | Model | Purpose |
|----------|-------|---------|
| Zero-shot classification | `facebook/bart-large-mnli` | Misinformation probability |
| NER | `dbmdz/bert-large-cased-finetuned-conll03-english` | Named entity extraction |
| AI Detection | `gpt2` | AI-generated text detection via perplexity + burstiness |
| Language Detection | `langdetect` | Language identification |
| Video Frame Analysis | `EfficientNet-B0` | Image anomaly detection per frame |
| Face Detection | `MediaPipe` / `OpenCV Haar Cascade` | Face detection in video frames |

## Setup

### 1. Python AI Service

```bash
cd backend/src/ai_service

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the service
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

The service will pre-load models on startup. First request may take 30-60 seconds while models download.

### 2. Node.js Backend

```bash
cd backend

# Install dependencies
npm install

# Start the backend (ensure MongoDB is running)
npm run dev
```

### 3. Run Tests

```bash
cd backend
node test-text-analysis.js
```

## API Endpoints

### Direct Text Analysis (Node.js Backend)

```
POST /api/v1/content/analyze-text
```

**Request:**
```json
{
  "text": "Your text to analyze here",
  "postId": "507f1f77bcf86cd799439011"
}
```

**Response:**
```json
{
  "success": true,
  "analysis": {
    "id": "...",
    "preprocessing": {
      "characterCount": 28,
      "wordCount": 5,
      "sentenceCount": 1,
      "language": "en",
      "languageConfidence": 0.9999,
      "cleanedText": "Your text to analyze here"
    },
    "misinformationProbability": 0.0234,
    "aiGeneratedProbability": 0.1567,
    "claims": [],
    "entities": [],
    "confidence": 0.65,
    "modelVersion": "nexora-text-v1.2.0",
    "processingTimeMs": 2340,
    "errors": [],
    "finalScore": 78
  },
  "cached": false
}
```

### Claim & Entity Extraction (Module 12)

```
POST /api/v1/content/extract-claims
GET  /api/v1/content/extract-claims/:postId
POST /api/v1/analyze/claims-entities
GET  /api/v1/analyze/claims-entities/:jobId
```

**Request:**
```json
{
  "text": "According to a study published in Nature, scientists found that...",
  "postId": "507f1f77bcf86cd799439011"
}
```

**Response:**
```json
{
  "success": true,
  "analysis": {
    "id": "...",
    "status": "completed",
    "claims": [
      {
        "text": "According to a study published in Nature, scientists found that...",
        "claimType": "factual claim",
        "subject": "scientists",
        "predicate": "found",
        "object": "that...",
        "misinformationProbability": 0.05,
        "confidence": 0.82,
        "textHash": "a1b2c3d4...",
        "factCheckStatus": "verified",
        "factCheckResults": [...]
      }
    ],
    "entities": [
      {
        "text": "Nature",
        "type": "ORG",
        "confidence": 1.0,
        "start": 35,
        "end": 41
      }
    ],
    "confidence": 0.85,
    "verificationScore": 80,
    "modelVersion": "nexora-claims-v1.0.0"
  }
}
```

### Python AI Service (Direct)

```
POST http://localhost:8000/analyze/text
POST http://localhost:8000/analyze/claims-entities
GET  http://localhost:8000/health
GET  http://localhost:8000/
```

### Retrieve Stored Analysis

```
GET /api/v1/content/analyze-text/:postId
```

### AI Service Health Check

```
GET /api/v1/content/analyze-text/health
```

## Features

1. **Text Preprocessing** — Character/word/sentence counting, whitespace normalization
2. **Language Detection** — Identifies text language with confidence score
3. **Misinformation Classification** — Zero-shot classification into 5 categories
4. **AI-Generated Text Detection** — Perplexity + burstiness analysis under GPT-2
5. **Named Entity Recognition** — BERT-based NER for PERSON, ORG, GPE, etc.
6. **NLP Claim Extraction** — spaCy SVO parsing + zero-shot classification with claim types (factual, causal, statistical, expert opinion, prediction, moral, definition)
7. **Entity Extraction** — BERT NER with normalized types (PERSON, ORG, LOCATION, DATE, etc.)
8. **Claim Deduplication** — SHA-256 text hashing for efficient duplicate detection
9. **Fact Verification Integration** — Extracted claims auto-verified against Google Fact Check API
10. **Confidence Scoring** — Composite heuristic based on text length, language, claims, entities
11. **Model Versioning** — Tracked via `modelVersion` field

## Error Handling

- If a model fails to load, the service returns a degraded response with errors
- Empty/whitespace text is rejected with validation error
- Missing required fields return clear error messages
- AI service timeouts are handled gracefully
- No fabricated results — model failures are reported explicitly

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_SERVICE_URL` | `http://127.0.0.1:8000` | Python AI service URL |
| `PORT` | `5000` | Node.js backend port |
| `NEXORA_MISINFO_MODEL` | *(unset)* | Directory of a fine-tuned misinformation model from `training/train.py --task text`. When set, text analysis uses it; otherwise zero-shot classification is used and reported in the response. |
| `NEXORA_CLAIM_MODEL` | *(unset)* | Directory of a fine-tuned FEVER claim model (`--task claim`). Attaches per-claim SUPPORTS/REFUTES verification evidence. |
| `NEXORA_IMAGE_MODEL` | *(unset)* | Directory of a fine-tuned GenImage AI-image detector (`--task image`). Adds real `aiGeneratedProbability` to image analysis. |
| `NEXORA_VIDEO_MODEL` | *(unset)* | Directory of a fine-tuned FaceForensics++ detector (`--task video`). Blended into per-frame manipulation score. |
| `NEXORA_AUDIO_MODEL` | *(unset)* | Directory of a fine-tuned ASVspoof detector (`--task audio`). Primary synthetic-speech probability. |

## Training Pipeline

A reproducible fine-tuning pipeline lives in `training/` covering all 7
real datasets (LIAR, FEVER, FakeNewsNet, NELA-GT, Fakeddit, GenImage,
FaceForensics++, ASVspoof) across six tasks (text, claim, image, video,
audio, multimodal). Train/val/test splits are created before tokenization
(no leakage); evaluation happens only on the held-out TEST split. See
`training/README.md` for the full dataset matrix, licenses, and commands:

```bash
python training/download_datasets.py --datasets liar fever
python training/preprocess.py --datasets liar fever --output-dir training/preprocessed
python training/train.py --task text --data-dir training/preprocessed --output-dir training/models/nexora-text-v1
python training/evaluate.py --task text --model-dir training/models/nexora-text-v1 --data-dir training/preprocessed
```

## Video Analysis (Module 9)

### POST /analyze/video (Python AI Service)

**Request:**
```json
{
  "mediaUrl": "https://res.cloudinary.com/.../video.mp4",
  "postId": "507f1f77bcf86cd799439011"
}
```

**Response:**
```json
{
  "success": true,
  "postId": "507f1f77bcf86cd799439011",
  "deepfakeProbability": 0.1234,
  "manipulationProbability": 0.0987,
  "frameCount": 300,
  "analyzedFrames": 30,
  "frames": [...],
  "temporalConsistency": {
    "interFrameVariance": 0.0234,
    "temporalCoherence": 0.8765,
    "flickerScore": 0.05,
    "consistentManipulation": false
  },
  "faceDetectionRate": 0.9,
  "confidence": 0.85,
  "modelVersion": "nexora-video-v1.0.0",
  "processingTimeMs": 15000,
  "errors": []
}
```

### POST /api/v1/content/analyze-video (Node.js Backend)

**Request:**
```json
{
  "mediaUrl": "https://res.cloudinary.com/.../video.mp4",
  "postId": "507f1f77bcf86cd799439011"
}
```

### Video Analysis Pipeline

1. Download video from Cloudinary URL (max 200MB)
2. Validate format, FPS, duration (max 600s)
3. Sample frames at 1-second intervals (max 30 frames)
4. Detect faces per frame (MediaPipe or OpenCV)
5. Analyze per-frame: frequency domain, color, texture, face coherence
6. Aggregate frame scores
7. Temporal consistency analysis
8. Produce deepfake + manipulation probabilities
9. Store results in MongoDB
10. Create TrustScore document

### Error Handling

- Invalid/corrupted video → 422 error
- Video too large (>200MB) → 422 error
- Video too long (>600s) → 422 error
- AI service unavailable → 503 error
- Processing timeout → 504 error
- All failures mark job FAILED or REVIEW_REQUIRED (never fake results)

## Test Cases

The test script (`test-text-analysis.js`) covers:

1. Obviously factual text
2. Obviously false claims
3. Neutral/opinion text
4. AI-generated text style
5. Empty text
6. Whitespace-only text
7. Very long text (1000+ words)
8. Malformed request (missing text)
9. Malformed request (missing postId)
10. Empty JSON body
11. Wrong Content-Type header
12. Short text
13. Text with named entities

### Video Test Cases

1. Short valid video (< 10s)
2. Long valid video (30s+)
3. Invalid file format
4. Non-existent URL
5. Very large video (>200MB)
6. Video with clear faces
7. Video with no faces
8. Corrupted video file
