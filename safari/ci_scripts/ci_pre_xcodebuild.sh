#!/bin/sh
set -euo pipefail

echo "==> Xcode Cloud pre-xcodebuild"

echo "Branch: ${CI_BRANCH:-unknown}"
echo "Workflow: ${CI_WORKFLOW:-unknown}"
echo "Xcode action: ${CI_XCODEBUILD_ACTION:-unknown}"

# Optional hook for future checks (SwiftLint, codegen validation, etc.)
# Keep this script intentionally lightweight and deterministic.
