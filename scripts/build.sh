#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PACKAGE_JSON="$ROOT_DIR/packages/downcity/package.json"

node --input-type=module - "$PACKAGE_JSON" <<'NODE'
import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Missing package.json path');
  process.exit(1);
}

const raw = fs.readFileSync(file, 'utf8');
const pkg = JSON.parse(raw);
const version = String(pkg.version || '');
const m = version.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
if (!m) {
  console.error(`Unsupported version format: ${version}`);
  process.exit(1);
}

const major = Number(m[1]);
const minor = Number(m[2]);
const patch = Number(m[3]);
pkg.version = `${major}.${minor}.${patch + 1}`;

fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log(`Patched version: ${version} -> ${pkg.version}`);
NODE

# 关键点（中文）：仓库级 build 顺序固定为：
# 1) 先构建 @downcity/ui，保证 workspace 消费方拿到最新 dist
# 2) 再构建 homepage
# 3) 再构建 console-ui（输出到 packages/downcity/public）
# 4) 最后构建 downcity package（tsc + copy assets）
if command -v bun >/dev/null 2>&1; then
  (cd "$ROOT_DIR/packages/downcity-ui" && bun run build)
  (cd "$ROOT_DIR/homepage" && bun run build)
  (cd "$ROOT_DIR/console-ui" && bun run build)
  (cd "$ROOT_DIR/packages/downcity" && bun run build)
elif command -v pnpm >/dev/null 2>&1; then
  pnpm -C "$ROOT_DIR/packages/downcity-ui" build
  pnpm -C "$ROOT_DIR/homepage" build
  pnpm -C "$ROOT_DIR/console-ui" build
  pnpm -C "$ROOT_DIR/packages/downcity" build
else
  npm --prefix "$ROOT_DIR/packages/downcity-ui" run build
  npm --prefix "$ROOT_DIR/homepage" run build
  npm --prefix "$ROOT_DIR/console-ui" run build
  npm --prefix "$ROOT_DIR/packages/downcity" run build
fi

# 关键点（中文）：每次仓库级 build 后，自动把当前 package 安装到全局 CLI（city/downcity）。
npm install -g "$ROOT_DIR/packages/downcity"
