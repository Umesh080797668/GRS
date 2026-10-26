# Runbook: Android APK Release & Distribution

**Document ID:** RB-003  
**Target Milestone:** M9.5, M11  
**Applies to:** Mobile Release Engineer  

---

## 1. Keystore Security Rules
1. **Never commit the release keystore** or passwords into git.
2. Store the production signing keystore in **two separate, highly secured backup locations**. Losing this keystore permanently prevents updating existing field devices!
3. Minimum supported Android version: Android 10 (API level 29).

---

## 2. Release Build Steps

### Step 1: Pre-Build Verifications
1. Run quality gates:
   ```bash
   dart format --set-exit-if-changed .
   flutter analyze
   flutter test
   ```
2. Verify Android Manifest permissions (Invariant 7):
   ```bash
   grep "uses-permission" apps/mobile/android/app/src/main/AndroidManifest.xml
   ```
   *Only `INTERNET`, `ACCESS_NETWORK_STATE`, and `RECEIVE_BOOT_COMPLETED` are permitted.*

### Step 2: Build Signed Release APK
```bash
cd apps/mobile
flutter build apk --release --split-per-abi=false
```

### Step 3: Generate Checksum
```bash
cd build/app/outputs/flutter-apk/
sha256sum app-release.apk > checksum.sha256
cat checksum.sha256
```

### Step 4: Register Release in API
Super admin registers the new release in `app_releases` table via API:
```bash
POST /v1/releases
{
  "version": "1.0.0",
  "min_supported_version": "1.0.0",
  "apk_url": "https://download.grs.domain/releases/grs-v1.0.0.apk",
  "checksum": "<SHA256-HEX>",
  "release_notes": "Door-to-Door Skills Campaign initial release"
}
```

### Step 5: Test Fresh Install & Upgrade
1. Clean install on test devices (Android 10, Android 12, Android 14).
2. Install over previous build: verify encrypted local Drift database remains intact and operational without re-authentication.
