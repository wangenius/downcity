#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EXT_PACKAGE_JSON="$ROOT_DIR/chrome-extension/package.json"
EXT_MANIFEST_JSON="$ROOT_DIR/chrome-extension/public/manifest.json"

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

# 关键点（中文）：扩展构建优先复用仓库可用包管理器，避免环境差异导致失败。
if command -v bun >/dev/null 2>&1; then
  (cd "$ROOT_DIR/chrome-extension" && bun run build)
elif command -v pnpm >/dev/null 2>&1; then
  pnpm -C "$ROOT_DIR/chrome-extension" build
else
  npm --prefix "$ROOT_DIR/chrome-extension" run build
fi
