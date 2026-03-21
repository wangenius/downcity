#!/usr/bin/env bash
set -euo pipefail

# 关键点（中文）：
# - extension 的开发态 watch 构建统一通过脚本入口触发。
# - 避免把 vite 命令直接写在 package.json 里。

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR/chrome-extension"
npx vite build --watch
