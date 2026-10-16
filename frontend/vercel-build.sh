#!/bin/bash
set -e

git clone --depth 1 --branch stable https://github.com/flutter/flutter.git /tmp/flutter
export PATH="/tmp/flutter/bin:$PATH"

flutter --version
flutter pub get
flutter build web --no-wasm-dry-run \
  --dart-define=API_BASE_URL=https://nexora-backend-tznf.onrender.com