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

# 关键点（中文）：
# 1) 该脚本对应 extension 的统一 build 入口：先自动提升 patch 版本，再执行类型检查与打包。
# 2) 真正构建命令只放在这个脚本里，package.json 仅做脚本转发。
cd "$ROOT_DIR/chrome-extension"
npx tsc --noEmit
npx vite build
