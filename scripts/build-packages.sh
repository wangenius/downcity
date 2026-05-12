#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PACKAGES=()

usage() {
  echo "Usage: pnpm build:packages [--ui] [--all]"
  echo ""
  echo "  默认构建 agent + city（不含 UI SDK）"
  echo "  --ui    额外构建 @downcity/ui"
  echo "  --all   构建所有包"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ui)    PACKAGES+=("ui") ;;
    --all)   PACKAGES=("agent" "ui" "city") ; shift ; continue ;;
    -h|--help) usage ;;
    *)       usage ;;
  esac
  shift
done

# 默认：agent + city
if [[ ${#PACKAGES[@]} -eq 0 ]]; then
  PACKAGES=("agent" "city")
fi

echo "==> 构建 ${PACKAGES[*]} ..."
for pkg in "${PACKAGES[@]}"; do
  echo ""
  echo "--- @downcity/$pkg ---"
  pnpm -C "packages/$pkg" build
done

echo ""
echo "==> 完成"
