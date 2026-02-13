#!/bin/bash
# Test the Android build pipeline locally using `act`
#
# Prerequisites:
#   - act installed (brew install act)
#   - Docker running
#   - Fixture app at ../app-build-test-fixture/
#   - Test credentials at ../app-build-test-fixture/test-credentials/
#
# Usage:
#   ./scripts/test-act-android.sh [build-only|with-submit]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTION_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
FIXTURE_DIR="$(cd "${ACTION_DIR}/../app-build-test-fixture" && pwd)"
CREDS_DIR="${FIXTURE_DIR}/test-credentials"

echo "=== app-build: Android integration test via act ==="
echo "Action dir:  ${ACTION_DIR}"
echo "Fixture dir: ${FIXTURE_DIR}"

# Verify prerequisites
command -v act &> /dev/null || { echo "ERROR: act not installed (brew install act)"; exit 1; }
docker info &> /dev/null 2>&1 || { echo "ERROR: Docker not running"; exit 1; }
[ -f "${FIXTURE_DIR}/app.json" ] || { echo "ERROR: Fixture app not found"; exit 1; }
[ -f "${CREDS_DIR}/.env" ] || { echo "ERROR: Test credentials not found"; exit 1; }

# Package the action
echo ""
echo "--- Packaging action ---"
cd "${ACTION_DIR}"
npm run package 2>&1 | tail -1
npm run package:cleanup 2>&1 | tail -1

# Copy packaged action into fixture repo as local action
LOCAL_ACTION_DIR="${FIXTURE_DIR}/.app-build-action"
rm -rf "${LOCAL_ACTION_DIR}"
mkdir -p "${LOCAL_ACTION_DIR}/dist/cleanup"
cp "${ACTION_DIR}/action.yml" "${LOCAL_ACTION_DIR}/"
cp "${ACTION_DIR}/dist/index.js" "${LOCAL_ACTION_DIR}/dist/"
cp "${ACTION_DIR}/dist/index.js.map" "${LOCAL_ACTION_DIR}/dist/" 2>/dev/null || true
cp "${ACTION_DIR}/dist/sourcemap-register.js" "${LOCAL_ACTION_DIR}/dist/" 2>/dev/null || true
cp "${ACTION_DIR}/dist/licenses.txt" "${LOCAL_ACTION_DIR}/dist/" 2>/dev/null || true
cp "${ACTION_DIR}/dist/cleanup/index.js" "${LOCAL_ACTION_DIR}/dist/cleanup/"
cp "${ACTION_DIR}/dist/cleanup/index.js.map" "${LOCAL_ACTION_DIR}/dist/cleanup/" 2>/dev/null || true
cp "${ACTION_DIR}/dist/cleanup/sourcemap-register.js" "${LOCAL_ACTION_DIR}/dist/cleanup/" 2>/dev/null || true

MODE="${1:-build-only}"
SUBMIT="false"
[ "${MODE}" = "with-submit" ] && SUBMIT="true"
echo "Mode: ${MODE} (submit=${SUBMIT})"

# Create workflow — no checkout step since act bind-mounts the working directory
WORKFLOW_DIR="${FIXTURE_DIR}/.github/workflows"
mkdir -p "${WORKFLOW_DIR}"

cat > "${WORKFLOW_DIR}/test-android.yml" << YAML
name: Test Android Build
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Set up Android SDK
        uses: android-actions/setup-android@v3

      - name: Build Android
        uses: ./.app-build-action
        with:
          platform: android
          profile: production
          submit: '${SUBMIT}'
          version-bump: 'true'
          cache: 'false'
          android-keystore: \${{ secrets.ANDROID_KEYSTORE }}
          android-keystore-password: \${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          android-key-alias: \${{ secrets.ANDROID_KEY_ALIAS }}
          android-key-password: \${{ secrets.ANDROID_KEY_PASSWORD }}
          google-play-service-account: \${{ secrets.GOOGLE_PLAY_SERVICE_ACCOUNT }}
YAML

echo ""
echo "--- Running act ---"
cd "${FIXTURE_DIR}"

act push \
  --secret-file "${CREDS_DIR}/.env" \
  --workflows "${WORKFLOW_DIR}/test-android.yml" \
  --platform "ubuntu-latest=ghcr.io/catthehacker/ubuntu:full-latest" \
  --bind \
  2>&1

EXIT_CODE=$?

# Cleanup
rm -rf "${LOCAL_ACTION_DIR}"
rm -f "${WORKFLOW_DIR}/test-android.yml"
rmdir "${WORKFLOW_DIR}" 2>/dev/null || true
rmdir "${FIXTURE_DIR}/.github" 2>/dev/null || true

if [ ${EXIT_CODE} -eq 0 ]; then
  echo ""
  echo "=== Android build test PASSED ==="
else
  echo ""
  echo "=== Android build test FAILED (exit code: ${EXIT_CODE}) ==="
fi

exit ${EXIT_CODE}
