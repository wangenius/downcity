#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PACKAGES=()

usage() {
  echo "Usage: pnpm build:packages [--ui] [--all] [--no-bump]"
  echo ""
  echo "  默认构建 agent + city，并自增 patch 版本号"
  echo "  --ui       额外构建 @downcity/ui"
  echo "  --all      构建所有包"
  echo "  --no-bump  跳过版本号自增"
  exit 1
}

BUMP=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ui)       PACKAGES+=("ui") ;;
    --all)      PACKAGES=("agent" "ui" "city") ; shift ; continue ;;
    --no-bump)  BUMP=false ;;
    -h|--help)  usage ;;
    *)          usage ;;
  esac
  shift
done

if [[ ${#PACKAGES[@]} -eq 0 ]]; then
  PACKAGES=("agent" "city")
fi

# bump patch version for each package
if $BUMP; then
  for pkg in "${PACKAGES[@]}"; do
    node "$ROOT_DIR/scripts/bump-package-version.mjs" "$ROOT_DIR/packages/$pkg/package.json"
  done
fi

echo "==> 构建 ${PACKAGES[*]} ..."
for pkg in "${PACKAGES[@]}"; do
  echo ""
  echo "--- @downcity/$pkg ---"
  pnpm -C "packages/$pkg" build
done

echo ""
echo "==> 完成"

# 构建 city 后重新全局安装
if [[ " ${PACKAGES[*]} " =~ " city " ]]; then
  echo ""
  echo "==> 全局安装 city CLI ..."
  rm -f /opt/homebrew/bin/city /opt/homebrew/bin/downcity 2>/dev/null || true
  npm install -g "$ROOT_DIR/packages/city"
fi
