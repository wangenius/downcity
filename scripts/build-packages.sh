#!/usr/bin/env bash
set -euo pipefail

# 关键点（中文）：
# 1) 这个脚本负责“packages 级 patch bump + build”，不承担 homepage / console 的全仓交付链路。
# 2) 统一入口支持按包选择：agent、city、ui；默认构建 agent + city。
# 3) bump 只作用于本次显式选中的 package，避免误改无关包版本号。

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PACKAGES=()
ALL_PACKAGES=("agent" "ui" "city")
BUILD_PACKAGES=()
BUMP=true

usage() {
  echo "Usage: npm run patch:build -- [--agent] [--city] [--ui] [--all] [--no-bump]"
  echo ""
  echo "  默认构建 agent + city，并自增对应 package 的 patch 版本号"
  echo "  --agent    构建 @downcity/agent"
  echo "  --city     构建 @downcity/city"
  echo "  --ui       构建 @downcity/ui"
  echo "  --all      构建全部 packages（agent + ui + city）"
  echo "  --no-bump  跳过 patch 版本号自增"
  exit 1
}

add_package() {
  local pkg="$1"
  local item
  for item in "${PACKAGES[@]}"; do
    if [[ "$item" == "$pkg" ]]; then
      return 0
    fi
  done
  PACKAGES+=("$pkg")
}

normalize_packages() {
  local ordered=()
  local pkg
  for pkg in "${ALL_PACKAGES[@]}"; do
    local selected
    for selected in "${PACKAGES[@]}"; do
      if [[ "$selected" == "$pkg" ]]; then
        ordered+=("$pkg")
        break
      fi
    done
  done
  PACKAGES=("${ordered[@]}")
}

resolve_build_packages() {
  local resolved=("${PACKAGES[@]}")
  local selected
  for selected in "${PACKAGES[@]}"; do
    if [[ "$selected" == "city" ]]; then
      local has_agent=false
      local item
      for item in "${resolved[@]}"; do
        if [[ "$item" == "agent" ]]; then
          has_agent=true
          break
        fi
      done
      if [[ "$has_agent" == false ]]; then
        resolved+=("agent")
      fi
      break
    fi
  done

  local ordered=()
  local pkg
  for pkg in "${ALL_PACKAGES[@]}"; do
    local item
    for item in "${resolved[@]}"; do
      if [[ "$item" == "$pkg" ]]; then
        ordered+=("$pkg")
        break
      fi
    done
  done
  BUILD_PACKAGES=("${ordered[@]}")
}

run_build() {
  local pkg="$1"
  echo ""
  echo "--- @downcity/$pkg ---"
  if command -v pnpm >/dev/null 2>&1; then
    pnpm -C "packages/$pkg" build
  else
    npm --prefix "packages/$pkg" run build
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent)    add_package "agent" ;;
    --city)     add_package "city" ;;
    --ui)       add_package "ui" ;;
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
normalize_packages
resolve_build_packages

if $BUMP; then
  echo "==> patch bump: ${PACKAGES[*]}"
  for pkg in "${PACKAGES[@]}"; do
    node "$ROOT_DIR/scripts/bump-package-version.mjs" "$ROOT_DIR/packages/$pkg/package.json"
  done
else
  echo "==> patch bump skipped"
fi

echo "==> 构建 ${BUILD_PACKAGES[*]} ..."
for pkg in "${BUILD_PACKAGES[@]}"; do
  run_build "$pkg"
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
