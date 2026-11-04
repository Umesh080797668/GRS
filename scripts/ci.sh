#!/usr/bin/env bash
set -euo pipefail

echo "===================================================="
echo " GRS Local CI / Quality Gates Runner"
echo "===================================================="

# 1. API Checks
echo ""
echo "--- [1/5] Running NestJS API Quality Gates ---"
echo "Building NestJS API..."
pnpm --filter api run build
echo "Running NestJS Unit Tests..."
pnpm --filter api run test:unit

# 2. Next.js Web Dashboard Checks
echo ""
echo "--- [2/5] Running Next.js Web Dashboard Quality Gates ---"
echo "Linting Next.js Web Dashboard..."
pnpm --filter dashboard lint
echo "Running Next.js Web Dashboard Unit Tests..."
pnpm --filter dashboard test
echo "Building and validating Next.js Web Dashboard (apps/dashboard)..."
(cd apps/dashboard && pnpm build)

# 3. Dart & Flutter Checks (Mobile & Packages)
echo ""
echo "--- [3/5] Running Dart & Flutter Quality Gates (Mobile & Shared Packages) ---"
echo "Checking Dart formatting..."
dart format --output=none --set-exit-if-changed packages/grs_core packages/grs_ui apps/mobile

for pkg in packages/grs_core packages/grs_ui apps/mobile; do
  echo "Analyzing $pkg..."
  (cd "$pkg" && flutter analyze)
  echo "Testing $pkg..."
  (cd "$pkg" && flutter test)
done

echo "Verifying trilingual l10n parity (M2.3 CI Check: every string has all 3 keys)..."
(cd apps/mobile && flutter test test/l10n_test.dart)

# 4. Security Invariant Checks
echo ""
echo "--- [4/5] Running Security Invariant Checks ---"

if [ -f "apps/mobile/android/app/src/main/AndroidManifest.xml" ]; then
  echo "Checking Android Manifest permissions (Invariant 7)..."
  DISALLOWED=$(grep "uses-permission" apps/mobile/android/app/src/main/AndroidManifest.xml | \
    grep -v "android.permission.INTERNET" | \
    grep -v "android.permission.ACCESS_NETWORK_STATE" | \
    grep -v "android.permission.REQUEST_INSTALL_PACKAGES" || true)
  if [ -n "$DISALLOWED" ]; then
    echo "ERROR: Disallowed Android permissions found:"
    echo "$DISALLOWED"
    exit 1
  fi
  echo "Android permissions valid: Only INTERNET, ACCESS_NETWORK_STATE, and REQUEST_INSTALL_PACKAGES (Decision C22 OTA in-app updater)."
fi

echo "Scanning client code for secret leaks (Invariant 5)..."
LEAKS=$(grep -rn "SUPABASE_SERVICE_ROLE_KEY" apps/mobile apps/dashboard packages/ 2>/dev/null || true)
if [ -n "$LEAKS" ]; then
  echo "ERROR: SUPABASE_SERVICE_ROLE_KEY found in client source code!"
  echo "$LEAKS"
  exit 1
fi
echo "Secret scan passed: No service-role key in client codebase."

# 5. Traceability Coverage Check (M1.9)
echo ""
echo "--- [5/5] Running Traceability 5-Layer Coverage Check ---"
node scripts/check_traceability.cjs


echo ""
echo "===================================================="
echo " ALL LOCAL CI QUALITY GATES PASSED! "
echo "===================================================="
