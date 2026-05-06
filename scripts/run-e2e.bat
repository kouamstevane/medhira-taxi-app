@echo off
setlocal
set GCLOUD_PROJECT=medjira-service
set FIRESTORE_EMULATOR_HOST=localhost:8080
set FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
set FIREBASE_FUNCTIONS_EMULATOR_HOST=localhost:5001
set STRIPE_API_HOST=localhost
set STRIPE_API_PORT=12111
set STRIPE_API_PROTOCOL=http
call npm --prefix functions run build
if errorlevel 1 exit /b 1
firebase emulators:exec --only auth,firestore,functions "npx playwright test %PLAYWRIGHT_ARGS%"
endlocal
