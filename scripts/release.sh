#!/usr/bin/env bash
# ==============================================================================
# Automated Release & Version Bumper for GRS Mobile App
# ==============================================================================
# Usage:
#   ./scripts/release.sh [patch|minor|major|x.y.z] [--no-push]
#
# Examples:
#   ./scripts/release.sh patch       # 1.0.0 -> 1.0.1
#   ./scripts/release.sh minor       # 1.0.0 -> 1.1.0
#   ./scripts/release.sh major       # 1.0.0 -> 2.0.0
#   ./scripts/release.sh 1.2.0       # Set explicitly to 1.2.0
#   ./scripts/release.sh patch --no-push
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PUBSPEC_PATH="${ROOT_DIR}/apps/mobile/pubspec.yaml"
PACKAGE_JSON="${ROOT_DIR}/package.json"

BUMP_TYPE="patch"
PUSH=true

for arg in "$@"; do
  case "$arg" in
    patch|minor|major)
      BUMP_TYPE="$arg"
      ;;
    --no-push)
      PUSH=false
      ;;
    v*.*.*|*.*.*)
      BUMP_TYPE="${arg#v}"
      ;;
    -h|--help)
      echo "Usage: $0 [patch|minor|major|x.y.z] [--no-push]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: $0 [patch|minor|major|x.y.z] [--no-push]"
      exit 1
      ;;
  esac
done

cd "$ROOT_DIR"

# Ensure git working directory is clean
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Error: Working tree has uncommitted changes. Please commit or stash them first."
  git status --short
  exit 1
fi

# 1. Read current version from pubspec.yaml
RAW_LINE=$(grep "^version:" "$PUBSPEC_PATH" | head -1)
CURRENT_FULL=$(echo "$RAW_LINE" | awk '{print $2}')
CURRENT_VER="${CURRENT_FULL%+*}"
CURRENT_BUILD="${CURRENT_FULL#*+}"

if [ "$CURRENT_VER" = "$CURRENT_BUILD" ] || [ -z "$CURRENT_BUILD" ]; then
  CURRENT_BUILD="1"
fi

echo "📦 Current Mobile Version: ${CURRENT_VER} (Build: ${CURRENT_BUILD})"

# 2. Compute Next Version
NEW_BUILD=$((CURRENT_BUILD + 1))

if [[ "$BUMP_TYPE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEW_VER="$BUMP_TYPE"
else
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VER"
  case "$BUMP_TYPE" in
    patch)
      NEW_VER="${MAJOR}.${MINOR}.$((PATCH + 1))"
      ;;
    minor)
      NEW_VER="${MAJOR}.$((MINOR + 1)).0"
      ;;
    major)
      NEW_VER="$((MAJOR + 1)).0.0"
      ;;
  esac
fi

NEW_TAG="v${NEW_VER}"
NEW_FULL="${NEW_VER}+${NEW_BUILD}"

# Check if tag already exists
if git rev-parse -q --verify "refs/tags/${NEW_TAG}" >/dev/null; then
  echo "❌ Error: Git tag ${NEW_TAG} already exists locally or on remote."
  exit 1
fi

echo "🚀 Bumping to: ${NEW_FULL} (Tag: ${NEW_TAG})"

# 3. Update apps/mobile/pubspec.yaml
sed -i "s/^version: .*/version: ${NEW_FULL}/" "$PUBSPEC_PATH"

# 4. Update root package.json if present
if [ -f "$PACKAGE_JSON" ]; then
  sed -i "s/\"version\": \".*\"/\"version\": \"${NEW_VER}\"/" "$PACKAGE_JSON"
fi

# 5. Commit and Create Git Tag
git add "$PUBSPEC_PATH" "$PACKAGE_JSON"
git commit -m "chore(release): bump mobile version to ${NEW_FULL} (${NEW_TAG})"
git tag -a "${NEW_TAG}" -m "Release ${NEW_TAG}"

echo "✅ Created commit and tag: ${NEW_TAG}"

# 6. Push to Origin
if [ "$PUSH" = true ]; then
  echo "📤 Pushing commit and tag to origin..."
  git push origin main
  git push origin "${NEW_TAG}"
  echo "🎉 Tag ${NEW_TAG} pushed! GitHub Actions will now build and publish the release."
else
  echo "ℹ️  Changes committed and tagged locally. Run 'git push origin main --tags' when ready."
fi
