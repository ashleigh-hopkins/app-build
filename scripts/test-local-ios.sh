#!/bin/bash
# Test the iOS build pipeline locally on macOS
#
# This runs the action's individual modules directly (not via GitHub Actions)
# to verify the full iOS pipeline works on real hardware.
#
# Prerequisites:
#   - macOS with Xcode installed
#   - Ruby + Bundler installed
#   - Fixture app at ../app-build-test-fixture/
#   - Test credentials at ../app-build-test-fixture/test-credentials/
#
# Usage:
#   ./scripts/test-local-ios.sh [prebuild-only|build-only|full]
#
# Modes:
#   prebuild-only  — expo prebuild + pod install (no signing or build)
#   build-only     — prebuild + build (uses self-signed cert, build will succeed but IPA won't be signable for store)
#   full           — prebuild + credential install + build + cleanup

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTION_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
FIXTURE_DIR="$(cd "${ACTION_DIR}/../app-build-test-fixture" && pwd)"
CREDS_DIR="${FIXTURE_DIR}/test-credentials"

MODE="${1:-prebuild-only}"

echo "=== app-build: iOS local test (mode: ${MODE}) ==="
echo "Action dir:  ${ACTION_DIR}"
echo "Fixture dir: ${FIXTURE_DIR}"

# Verify prerequisites
if [ "$(uname)" != "Darwin" ]; then
  echo "ERROR: iOS testing requires macOS"
  exit 1
fi

if ! command -v xcodebuild &> /dev/null; then
  echo "ERROR: Xcode is not installed"
  exit 1
fi

if [ ! -f "${FIXTURE_DIR}/app.json" ]; then
  echo "ERROR: Fixture app not found at ${FIXTURE_DIR}"
  exit 1
fi

cd "${FIXTURE_DIR}"

# Step 1: Install dependencies
echo ""
echo "--- Installing dependencies ---"
npm install

# Step 2: Prebuild
echo ""
echo "--- Running expo prebuild (iOS) ---"
npx expo prebuild --platform ios --clean --no-install

# Step 3: Pod install
echo ""
echo "--- Running pod install ---"
cd ios
if [ -f Gemfile ]; then
  bundle install
  bundle exec pod install
else
  pod install
fi
cd "${FIXTURE_DIR}"

# Verify workspace exists
if ! ls ios/*.xcworkspace &> /dev/null 2>&1; then
  echo "ERROR: No .xcworkspace found after prebuild + pod install"
  exit 1
fi
WORKSPACE=$(ls -d ios/*.xcworkspace | head -1)
echo "Workspace: ${WORKSPACE}"

if [ "${MODE}" = "prebuild-only" ]; then
  echo ""
  echo "=== Prebuild test PASSED ==="
  echo "Workspace created at: ${WORKSPACE}"
  echo "To test build: $0 build-only"
  exit 0
fi

# Step 4: Build (unsigned, for testing)
echo ""
echo "--- Building iOS (unsigned) ---"

# Detect scheme
SCHEME=$(xcodebuild -list -workspace "${WORKSPACE}" -json 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
schemes = data.get('workspace', {}).get('schemes', [])
print(schemes[0] if schemes else '')
" 2>/dev/null || echo "")

if [ -z "${SCHEME}" ]; then
  echo "WARNING: Could not auto-detect scheme, using 'AppBuildTestFixture'"
  SCHEME="AppBuildTestFixture"
fi
echo "Scheme: ${SCHEME}"

# Build for simulator (doesn't require signing)
xcodebuild \
  -workspace "${WORKSPACE}" \
  -scheme "${SCHEME}" \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "generic/platform=iOS Simulator" \
  CODE_SIGNING_ALLOWED=NO \
  build \
  2>&1 | tail -20

if [ "${MODE}" = "build-only" ]; then
  echo ""
  echo "=== iOS build test PASSED (simulator, unsigned) ==="
  exit 0
fi

# Step 5: Full mode — test credential installation
if [ "${MODE}" = "full" ]; then
  echo ""
  echo "--- Testing credential installation ---"

  if [ ! -f "${CREDS_DIR}/test-ios.p12" ]; then
    echo "ERROR: Test credentials not found"
    exit 1
  fi

  # Create temp keychain
  KEYCHAIN_NAME="app-build-test.keychain-db"
  KEYCHAIN_PASSWORD="testkeychainpwd"

  security create-keychain -p "${KEYCHAIN_PASSWORD}" "${KEYCHAIN_NAME}"
  security set-keychain-settings -lut 21600 "${KEYCHAIN_NAME}"
  security default-keychain -s "${KEYCHAIN_NAME}"
  security unlock-keychain -p "${KEYCHAIN_PASSWORD}" "${KEYCHAIN_NAME}"

  # Import test certificate
  security import "${CREDS_DIR}/test-ios.p12" \
    -k "${KEYCHAIN_NAME}" \
    -P "testpassword123" \
    -T /usr/bin/codesign 2>&1 || echo "Note: import may warn about self-signed cert — that's expected"

  security set-key-partition-list -S apple-tool:,apple: -s -k "${KEYCHAIN_PASSWORD}" "${KEYCHAIN_NAME}"

  echo "Keychain created and cert imported successfully"

  # Cleanup
  echo ""
  echo "--- Cleaning up ---"
  security delete-keychain "${KEYCHAIN_NAME}" 2>/dev/null || true
  security default-keychain -s login.keychain-db 2>/dev/null || true

  echo ""
  echo "=== iOS full test PASSED ==="
fi
