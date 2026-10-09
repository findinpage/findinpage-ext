#!/bin/sh
set -euo pipefail

echo "==> Xcode Cloud post-clone: generating Xcode project with XcodeGen"

# Normalize from safari/ci_scripts/ to the repository root.
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/../.." && pwd)"
cd "$REPO_ROOT"

PROJECT_DIR="safari"
PROJECT_SPEC="${PROJECT_DIR}/project.yml"
NODE_VERSION="24.15.0"
PNPM_VERSION="10.13.1"
CI_TOOLS_DIR="${REPO_ROOT}/.xcode-cloud"
NODE_DIR="${CI_TOOLS_DIR}/node"

echo "==> Xcode Cloud post-clone: preparing Node.js ${NODE_VERSION} and pnpm ${PNPM_VERSION}"

export PATH="${NODE_DIR}/bin:${CI_TOOLS_DIR}/bin:${PATH}"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  case "$(uname -m)" in
    arm64) NODE_ARCH="arm64" ;;
    x86_64) NODE_ARCH="x64" ;;
    *)
      echo "error: unsupported macOS architecture: $(uname -m)"
      exit 1
      ;;
  esac

  NODE_ARCHIVE="node-v${NODE_VERSION}-darwin-${NODE_ARCH}.tar.gz"
  mkdir -p "$NODE_DIR"
  curl -fL "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}" |
    tar -xz -C "$NODE_DIR" --strip-components=1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  npm install --global --prefix "$CI_TOOLS_DIR" "pnpm@${PNPM_VERSION}"
fi

pnpm install --frozen-lockfile

if [ ! -f "$PROJECT_SPEC" ]; then
  echo "error: project.yml not found: ${REPO_ROOT}/${PROJECT_SPEC}"
  exit 1
fi

run_xcodegen() {
  "$1" generate --spec "$PROJECT_SPEC" --project "$PROJECT_DIR"
}

if command -v xcodegen >/dev/null 2>&1; then
  run_xcodegen "$(command -v xcodegen)"
elif command -v mint >/dev/null 2>&1; then
  mint run yonaskolb/XcodeGen@2.44.1 xcodegen generate --spec "$PROJECT_SPEC" --project "$PROJECT_DIR"
else
  echo "==> xcodegen not found, downloading portable XcodeGen binary..."
  XCODEGEN_VERSION="2.44.1"
  BIN_DIR="${TMPDIR:-/tmp}/xcodegen-bin"
  ZIP_PATH="${BIN_DIR}/xcodegen.zip"
  mkdir -p "$BIN_DIR"
  curl -fL "https://github.com/yonaskolb/XcodeGen/releases/download/${XCODEGEN_VERSION}/xcodegen.zip" -o "$ZIP_PATH"
  unzip -o -q "$ZIP_PATH" -d "$BIN_DIR"
  XCODEGEN_BIN="$(find "$BIN_DIR" -type f -name xcodegen -perm -111 | head -n 1 || true)"
  if [ -z "$XCODEGEN_BIN" ]; then
    XCODEGEN_BIN="$(find "$BIN_DIR" -type f -name xcodegen | head -n 1 || true)"
    if [ -n "$XCODEGEN_BIN" ]; then
      chmod +x "$XCODEGEN_BIN"
    fi
  fi
  if [ -z "$XCODEGEN_BIN" ]; then
    echo "error: downloaded XcodeGen archive does not contain an xcodegen binary."
    find "$BIN_DIR" -maxdepth 3 -print
    exit 1
  fi
  run_xcodegen "$XCODEGEN_BIN"
fi

if [ ! -d "${PROJECT_DIR}/Find in Page.xcodeproj" ]; then
  echo "error: ${PROJECT_DIR}/Find in Page.xcodeproj was not generated."
  exit 1
fi

echo "==> Generated Find in Page.xcodeproj successfully"
