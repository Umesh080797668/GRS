#!/usr/bin/env bash
set -euo pipefail

echo "===================================================="
echo " GRS Local CI / Quality Gates Runner"
echo "===================================================="

# 1. API Checks
echo ""
echo "--- [1/3] Running NestJS API Quality Gates ---"
cd apps/api
echo "Building NestJS API..."
npm run build
echo "Running NestJS Unit Tests..."
npm test
cd ../..

# 2. Dart & Flutter Checks
echo ""
echo "--- [2/3] Running Dart & Flutter Quality Gates ---"
echo "Checking Dart formatting..."
dart format --output=none --set-exit-if-changed packages/grs_core packages/grs_ui apps/mobile apps/dashboard

for pkg in packages/grs_core packages/grs_ui apps/mobile apps/dashboard; do
  echo "Analyzing $pkg..."
  (cd "$pkg" && flutter analyze)
  echo "Testing $pkg..."
  (cd "$pkg" && flutter test)
done

# 3. Security Invariant Checks
echo ""
echo "--- [3/3] Running Security Invariant Checks ---"
if [ -f "apps/mobile/android/app/src/main/AndroidManifest.xml" ]; then
  echo "Checking Android Manifest permissions (Invariant 7)..."
  DISALLOWED=$(grep "uses-permission" apps/mobile/android/app/src/main/AndroidManifest.xml | \
    grep -v "android.permission.INTERNET" | \
    grep -v "android.permission.ACCESS_NETWORK_STATE" | \
    grep -v "android.permission.RECEIVE_BOOT_COMPLETED" || true)
  if [ -n "$DISALLOWED" ]; then
    echo "ERROR: Disallowed Android permissions found:"
    echo "$DISALLOWED"
    exit 1
  fi
  echo "Android permissions valid: Only INTERNET, ACCESS_NETWORK_STATE, RECEIVE_BOOT_COMPLETED."
fi

echo "Scanning client code for secret leaks (Invariant 5)..."
LEAKS=$(grep -rn "SUPABASE_SERVICE_ROLE_KEY" apps/mobile apps/dashboard packages/ 2>/dev/null || true)
if [ -n "$LEAKS" ]; then
  echo "ERROR: SUPABASE_SERVICE_ROLE_KEY found in client source code!"
  echo "$LEAKS"
  exit 1
fi
echo "Secret scan passed: No service-role key in client codebase."

echo ""
echo "===================================================="
echo " ALL LOCAL CI QUALITY GATES PASSED! "
echo "===================================================="
