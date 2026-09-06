# Emulator Test Report — 20 Seed Users + Real Trust Labels + AI-Image Verification

**Date:** 2026-09-06 · **Device:** Android emulator `emulator-5554` (sdk gphone16k, API 37,
logical 360×640 @ density 320) · **Backend:** Express on :5000 (MongoDB Atlas) ·
**AI service:** FastAPI on :8000 (torch/cv2/mediapipe) · **App:** Nexora Flutter (debug build)

---

## 1. What was set up

### 20 real users (`backend/scripts/seed-real-env.js` → extended `backend/scripts/seed-ai-images.js`)

| Item | Value |
|---|---|
| Users | `seeduser01` … `seeduser20` — `seeduserNN@nexora.app` / `NexoraSeed123!` |
| Text posts | 5 per user (100 total) — real facts (science/space/health/history/…), each run through the **real trust-score engine** → labels computed, not hardcoded |
| Image posts | 1 per user (20 total) — **real AI-generated images** (Wikimedia Commons, e.g. "Théâtre d'Opéra Spatial", "Pope in puffy jacket", "Trump arrest", "AI hand", DALL·E photo) uploaded to Cloudinary |
| Image verification | **Real** end-to-end: post → ContentJob → Python `POST /analyze/image` (frequency/color/texture/face analysis) → `ImageAnalysis` doc → trust-score engine → `TrustScore` doc → post fields (`trustBadge`, `trustBreakdown`, status) |

Live data (DB `Nexora`): **20 seed users · 120 new posts (100 text + 20 image) · all with
TrustScore docs · 20 ImageAnalysis docs**. API feed confirmed:
`text → Green (96)`, `image → Orange (60)`, plus a pre-existing Orange text post (50).

Why image posts are **Orange** and not Green/Blue: image analysis never fabricates factual
evidence — `factualVerification` and `sourceCredibility` stay neutral (0.5) and authenticity
reflects measured manipulation probability (~0.27–0.58), so scores land ~50–60 → Orange
("Partially Verified / Needs Caution"). That is the honest engine output, and exactly what
the "AI image for verification" requirement should show.

## 2. Emulator test (automated, on-device)

`frontend/integration_test/seed_feed_test.dart` — **PASSED** on the emulator:

1. Boots app → onboarding → login screen → signs in as `seeduser01`.
2. Home feed loads from the live API.
3. Scrolls and finds **real Green label** ("Verified and Authentic Content") and **Orange
   label** ("Partially Verified / Needs Caution") strips.
4. Finds an **AI-image post** caption in the feed.
5. Taps a trust strip → **"Why this label?"** sheet opens with the label name + real score.

Also ran existing widget suite (`test/widget_test.dart`, 27 tests) — all pass. Backend suite
790/790 pass (a single 1 ms perf-timing test is flaky only under heavy system load).

Screenshots captured on-device during the run are in this folder (`feed-labels.png`,
`feed-scrolled.png`) — frame with green/orange badge pixels present = feed with real labels.

## 3. Bugs found (2 fixed in this pass)

### BUG 1 — Trust-label strip overflows the post card (horizontal) — FIXED
`frontend/lib/screens/home_screen.dart` `_trustScoreStrip()`
- Symptom (on-device): `A RenderFlex overflowed by 14–28 px on the right` on every post —
  real label names ("Partially Verified / Needs Caution") + `NN/100` chip + status chip
  don't fit the card width.
- Fix: label `Text` is now wrapped in `Flexible` with `maxLines: 1` + ellipsis, so the strip
  never exceeds the card. Verified: no overflow exception remains in the on-device run.

### BUG 2 — Onboarding page 1 overflows vertically on small phones — FIXED
`frontend/lib/screens/onboarding_screen.dart`
- Symptom (on-device): `A RenderFlex overflowed by 9.0 px on the bottom` right after app
  launch at 360×640 (73 px in an isolated widget probe without system insets).
- Fix: page body is now `LayoutBuilder` + `SingleChildScrollView` + `ConstrainedBox(minHeight:
  viewport)` + `IntrinsicHeight`, so content scrolls on short screens while the indicators +
  button stay pinned bottom when there is room. Pages 2 and 3 already fit.

## 4. Environment / setup issues encountered (not code bugs, but worth knowing)

1. **OpenCV 5.0 wheels no longer bundle Haar-cascade XMLs.** `image-analysis` fell back to an
   empty `CascadeClassifier` → assertion crash. Fix used here: installed
   `opencv-contrib-python==4.10.0.84` (bundles the cascades). Recommend hardening
   `_load_face_detector()` (bundled cascade path + `detector.empty()` check, or switch to
   MediaPipe Tasks API).
2. **MediaPipe 1.0.1 removed the legacy `mp.solutions.face_detection` API** that `app.py`
   targets — the MediaPipe branch of `_load_face_detector()` always throws and relies on the
   OpenCV fallback. Recommend updating to the current `mediapipe.tasks` API.
3. **Flutter Gradle build OOM:** default `org.gradle.jvmargs=-Xmx8G` + emulator + backend +
   Python service on a 16 GB machine → JVM native OOM crash. Built with `-Xmx3G` instead.
   (Restored the project's original gradle.properties afterwards.)

## 5. Improvements to make next

**Seed / demo data**
- Give a few image posts a **disclosed-AI + verified caption path** so the Blue label
  ("AI Generated but Verified") also appears in the feed; right now every image post is Orange
  by honest design, which undersells the label system in demos.
- Seed a couple of *real-photo* posts (e.g. from an open photo source) so Green/authentic
  image content is visible next to the AI images.
- Document the two-step seed run + prerequisites (Cloudinary creds, Python AI service on
  :8000, images already uploaded via `backend/uploads/seed-ai/cloudinary.json`).

**App / pipeline**
- In the Home feed, show an explicit "AI generated" cue for images whose
  `manipulationProbability`/frequency anomaly is high, instead of relying only on the Orange
  badge + detail sheet.
- Persist `aiGeneratedProbability` on the image post response (ImageAnalysis already stores
  it) so the UI can surface "likely AI-generated" without opening the detail sheet.
- Add retry + queue visibility for image jobs whose Python analysis times out (image analysis
  takes ~8 s/image here; the endpoint timeout is 120 s, fine, but the UI has no "analyzing"
  state for seeded/pending image posts).

**Testing**
- Add a widget test asserting no RenderFlex overflows at 360×640 for onboarding + feed
  (guards regressions like BUG 1/2).
- Promote `seed_feed_test.dart` to CI on an emulator with the seed prerequisites documented.

## 6. How to reproduce

```bash
# 1. Backend + DB + AI service
cd backend
npm run dev                    # :5000 (MONGO_URI in backend/.env)
cd src/ai_service && python -m uvicorn app:app --port 8000  # real image analysis

# 2. Seed (Atlas DB "Nexora")
cd backend
node scripts/seed-real-env.js          # 20 users + 100 text posts (idempotent)
# uploads/seed-ai/imgs + cloudinary.json must exist (upload helper in seed-ai-images.js)
node scripts/seed-ai-images.js         # + 20 verified AI-image posts

# 3. Emulator test
cd frontend
adb reverse tcp:5000 tcp:5000
flutter test integration_test/seed_feed_test.dart -d emulator-5554 --dart-define=API_HOST=localhost
```
