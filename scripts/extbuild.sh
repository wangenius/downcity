#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EXT_PACKAGE_JSON="$ROOT_DIR/products/chrome-extension/package.json"
EXT_MANIFEST_JSON="$ROOT_DIR/products/chrome-extension/public/manifest.json"
RELEASE_BUILD=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --release)
      RELEASE_BUILD=true
      ;;
    -h|--help)
      echo "Usage: bash ./scripts/extbuild.sh [--release]"
      echo ""
      echo "  默认只执行类型检查与打包，不修改版本号"
      echo "  --release  先同步提升 package.json / manifest.json patch 版本，再打包"
      exit 0
      ;;
    *)
      echo "Unsupported option: $1"
      echo "Usage: bash ./scripts/extbuild.sh [--release]"
      exit 1
      ;;
  esac
  shift
done

if [[ "$RELEASE_BUILD" == true ]]; then
  node --input-type=module - "$EXT_PACKAGE_JSON" "$EXT_MANIFEST_JSON" <<'NODE'
import fs from 'node:fs';

const packageFile = process.argv[2];
const manifestFile = process.argv[3];
if (!packageFile || !manifestFile) {
  console.error('Missing extension version file path(s)');
  process.exit(1);
}

function parsePatchVersion(version) {
  const m = String(version || '').match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
  };
}

const packageRaw = fs.readFileSync(packageFile, 'utf8');
const packageJson = JSON.parse(packageRaw);
const currentVersion = String(packageJson.version || '');
const parsed = parsePatchVersion(currentVersion);
if (!parsed) {
  console.error(`Unsupported extension version format: ${currentVersion}`);
  process.exit(1);
}

const nextVersion = `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
packageJson.version = nextVersion;
fs.writeFileSync(packageFile, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');

const manifestRaw = fs.readFileSync(manifestFile, 'utf8');
const manifestJson = JSON.parse(manifestRaw);
manifestJson.version = nextVersion;
fs.writeFileSync(manifestFile, JSON.stringify(manifestJson, null, 2) + '\n', 'utf8');

console.log(`Extension version patched: ${currentVersion} -> ${nextVersion}`);
NODE
else
  echo "Extension version patch skipped (use --release to bump)"
fi

# 关键点（中文）：
# 1) 普通 build 不修改版本号，避免验证构建污染 package.json / manifest.json。
# 2) release build 才自动提升 patch 版本，并复用同一套类型检查与打包流程。
cd "$ROOT_DIR/products/chrome-extension"
npx tsc --noEmit
npx vite build
