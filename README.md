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
```

## 📄 License

This project is private and not licensed for public use.
