#!/bin/sh
set -euo pipefail

echo "==> Xcode Cloud post-xcodebuild"

echo "Result bundle path: ${CI_RESULT_BUNDLE_PATH:-unavailable}"

# Optional hook for future artifact processing or notifications.
