# Nexora

> **Connect. Share. Verify.**

A full-stack social media platform built with Node.js/Express backend and Flutter frontend.

## 🏗️ Project Structure

```
nexora/
├── backend/                    # Node.js/Express API server
│   ├── src/
│   │   ├── config/             # Database & app configuration
│   │   ├── controllers/        # Route handlers / business logic
│   │   ├── middleware/          # Auth, validation, error handling
│   │   ├── models/             # Mongoose data models
│   │   ├── routes/             # API route definitions
│   │   ├── services/           # External service integrations
│   │   ├── utils/              # Helper functions & utilities
│   │   ├── ai_service/         # AI/ML service (Python)
│   │   ├── uploads/            # User-uploaded files
│   │   └── app.js              # Express app entry point
│   ├── .env                    # Environment variables (gitignored)
│   ├── package.json
│   └── package-lock.json
├── frontend/                   # Flutter mobile/web application
│   ├── lib/
│   │   ├── config/             # App configuration & constants
│   │   ├── models/             # Dart data models
│   │   ├── screens/            # UI screens / pages
│   │   ├── services/           # API service layer
│   │   └── widgets/            # Reusable UI components
│   ├── android/
│   ├── ios/
│   ├── web/
│   └── pubspec.yaml
└── docs/
    └── postman/                # API documentation & collections
```

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [MongoDB](https://www.mongodb.com/) (local or Atlas)
- [Flutter SDK](https://flutter.dev/docs/get-started/install) (v3.13+)

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

**Running on a physical phone (not the emulator):**

The app defaults to `http://10.0.2.2:5000` on Android, which only works inside
the Android emulator. On a real phone you have three options — no rebuild is
needed for the first two:

1. **In-app Server Address (recommended):** tap the ⚙ gear icon on the login
   screen (or **Settings → Developer → Server Address**) and enter the host of
   the machine running the backend. The value is saved on the device and used
   for every API + socket connection, so you can switch hosts freely.

2. **USB cable (`adb reverse`) — no Wi-Fi needed:**
   ```bash
   adb reverse tcp:5000 tcp:5000   # re-run after replugging the phone
   ```
   then set the in-app Server Address to `127.0.0.1`. This tunnels the phone's
   `localhost:5000` to the backend over USB, so it works even when the phone is
   on cellular data and the PC has no network.

3. **Compile-time flag:** point the app at the LAN IP of the machine running
   the backend (must be on the same Wi-Fi network):
   ```bash
   flutter run --dart-define=API_HOST=192.168.1.50   # your machine's LAN IP
   ```

Verify the phone can reach the backend first by opening
`http://192.168.1.50:5000/api/v1/health` in the phone's browser.

If you get a `Network error ... TimeoutException`, the app cannot reach the
backend — check the Server Address (gear icon) and that the backend is running.

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Authenticate user |
| GET | `/api/users/me` | Get current user profile |
| GET/POST | `/api/posts` | List / create posts |
| GET/POST | `/api/comments` | List / create comments |
| POST | `/api/likes` | Like / unlike a post |
| GET/POST | `/api/messages` | List / send messages |
| GET | `/api/notifications` | Get user notifications |
| POST | `/api/reports` | Report content |
| POST | `/api/moderation` | Content moderation |
| POST | `/api/trust-score` | Trust score evaluation |
| POST | `/api/fact-check` | Fact-check content |
| POST | `/api/v1/content/analyze/:postId` | Trigger the real analysis pipeline for a post |
| GET  | `/api/v1/content/analysis/:postId` | Get stored analysis results |
| POST | `/api/v1/moderation/requests` | Request moderator review (any user) |
| POST | `/api/v1/analyze/image` `/video` `/audio` `/link` | Submit media for real AI analysis |

## Real Trust Score & Verification Pipeline

Nexora's Trust Score is computed by the backend — never by the client —
using the documented weighted formula:

```
Trust Score = 100 × [ 0.35·Authenticity + 0.35·FactualVerification
                      + 0.20·SourceCredibility + 0.10·ModelConfidence ]
```

Weights live in `backend/src/services/trust-score.service.js` and are
configurable for later calibration. The flow per post:

```
post created → job queued → content type detected (text/image/video/audio/link)
→ Python AI analysis (transformers) → claim/entity extraction → Google Fact Check API
→ evidence normalization → trust score → rule-based label (Green/Blue/Purple/Orange/Red)
→ stored in MongoDB → served to the existing Flutter UI
```

- AI-generated detection is separate from factual truth (AI content can be
  verified/BLUE; human content can be false/RED).
- No evidence → no false certainty: the system reports `NO_EVIDENCE`/
  `PARTIALLY_VERIFIED` instead of fabricating a verdict.
- Fact-check results are filtered by relevance to the user's claim and
  cached for 24h.
- A fine-tuned misinformation classifier can be trained with
  `backend/src/ai_service/training/` (real LIAR/FEVER datasets, held-out
  test evaluation) and enabled via `NEXORA_MISINFO_MODEL`.

## Moderator Review

The in-app **Request Moderator Review** button creates a real
`REVIEW_REQUESTED` moderation log with a snapshot of the current AI
analysis, moves the post into the moderator queue, and never overwrites
the AI result. Moderator decisions are stored separately (approve / reject
/ label override) with full audit history.

## 🛠️ Tech Stack

**Backend:**
- [Express.js](https://expressjs.com/) — Web framework
- [MongoDB](https://www.mongodb.com/) + [Mongoose](https://mongoosejs.com/) — Database & ODM
- [JWT](https://jwt.io/) — Authentication
- [bcryptjs](https://github.com/nicolo-ribaudo/bcryptjs) — Password hashing
- [Axios](https://axios-http.com/) — HTTP client

**Frontend:**
- [Flutter](https://flutter.dev/) — Cross-platform UI
- [Dart](https://dart.dev/) — Programming language
- [image_picker](https://pub.dev/packages/image_picker) — Image selection
- [video_player](https://pub.dev/packages/video_player) — Video playback
- [shared_preferences](https://pub.dev/packages/shared_preferences) — Local storage

## 📁 Environment Variables

Create a `.env` file in the `backend/` directory:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/nexora
JWT_SECRET=your_jwt_secret_here

# Google Fact Check Tools API key (https://console.cloud.google.com/apis/library/factchecktools.googleapis.com)
GOOGLE_FACT_CHECK_API_KEY=

# Python AI service URL (transformers-based text/image/video/audio analysis)
AI_SERVICE_URL=http://127.0.0.1:8000

# Optional fine-tuned misinformation model directory (see backend/src/ai_service/training)
# NEXORA_MISINFO_MODEL=backend/src/ai_service/training/models/nexora-fakenews-distilbert
```

## 📄 License

This project is private and not licensed for public use.
