#!/usr/bin/env bash
set -euo pipefail

export GCLOUD_PROJECT=medjira-service
export FIRESTORE_EMULATOR_HOST=localhost:8080
export FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
export FIREBASE_FUNCTIONS_EMULATOR_HOST=localhost:5001
export STRIPE_API_HOST=localhost
export STRIPE_API_PORT=12111
export STRIPE_API_PROTOCOL=http

npm --prefix functions run build

firebase emulators:exec --only auth,firestore,functions "npx playwright test ${PLAYWRIGHT_ARGS:-}"
