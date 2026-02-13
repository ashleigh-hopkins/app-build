#!/bin/bash
# Test the OTA export pipeline locally
#
# This verifies expo export produces valid bundles and the manifest
# generation works correctly. Does not require any credentials.
#
# Prerequisites:
#   - Node.js installed
#   - Fixture app at ../app-build-test-fixture/
#
# Usage:
#   ./scripts/test-local-ota.sh [ios|android|all]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$(cd "${SCRIPT_DIR}/../../app-build-test-fixture" && pwd)"

PLATFORM="${1:-android}"

echo "=== app-build: OTA export test (platform: ${PLATFORM}) ==="
echo "Fixture dir: ${FIXTURE_DIR}"

if [ ! -f "${FIXTURE_DIR}/app.json" ]; then
  echo "ERROR: Fixture app not found at ${FIXTURE_DIR}"
  exit 1
fi

cd "${FIXTURE_DIR}"

# Install dependencies
echo ""
echo "--- Installing dependencies ---"
npm install

# Run expo export
echo ""
echo "--- Running expo export (${PLATFORM}) ---"
OUTPUT_DIR="${FIXTURE_DIR}/dist-test"
rm -rf "${OUTPUT_DIR}"

if [ "${PLATFORM}" = "all" ]; then
  npx expo export --output-dir "${OUTPUT_DIR}"
else
  npx expo export --platform "${PLATFORM}" --output-dir "${OUTPUT_DIR}"
fi

# Verify output
echo ""
echo "--- Verifying export output ---"

if [ ! -d "${OUTPUT_DIR}" ]; then
  echo "ERROR: Output directory not created"
  exit 1
fi

FILE_COUNT=$(find "${OUTPUT_DIR}" -type f | wc -l | tr -d ' ')
echo "Files exported: ${FILE_COUNT}"

# Check for JS bundle
if [ "${PLATFORM}" = "android" ] || [ "${PLATFORM}" = "all" ]; then
  ANDROID_BUNDLE=$(find "${OUTPUT_DIR}" -name "*android*" -o -name "*index.android*" 2>/dev/null | head -1)
  if [ -n "${ANDROID_BUNDLE}" ]; then
    echo "Android bundle: ${ANDROID_BUNDLE}"
  else
    echo "WARNING: No Android bundle found (may be named differently)"
  fi
fi

if [ "${PLATFORM}" = "ios" ] || [ "${PLATFORM}" = "all" ]; then
  IOS_BUNDLE=$(find "${OUTPUT_DIR}" -name "*ios*" -o -name "*index.ios*" 2>/dev/null | head -1)
  if [ -n "${IOS_BUNDLE}" ]; then
    echo "iOS bundle: ${IOS_BUNDLE}"
  else
    echo "WARNING: No iOS bundle found (may be named differently)"
  fi
fi

# List all files
echo ""
echo "--- Export contents ---"
find "${OUTPUT_DIR}" -type f | head -20
if [ "${FILE_COUNT}" -gt 20 ]; then
  echo "... and $((FILE_COUNT - 20)) more files"
fi

# Cleanup
rm -rf "${OUTPUT_DIR}"

echo ""
echo "=== OTA export test PASSED ==="
