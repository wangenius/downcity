#!/usr/bin/env bash
set -euo pipefail

# 关键点（中文）：
# 1) 这个脚本负责“packages 级 patch bump + build”，不承担 homepage / console 的全仓交付链路。
# 2) 统一入口支持按包选择：agent、city、services、gate、plugins、ui、cli；默认构建 agent + plugins + cli。
# 3) bump 只作用于本次显式选中的 package，避免误改无关包版本号。

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PACKAGES=()
ALL_PACKAGES=("agent" "city" "services" "gate" "plugins" "ui" "cli")
BUILD_PACKAGES=()
BUMP=true

usage() {
  echo "Usage: npm run patch:build -- [--agent] [--city] [--services] [--gate] [--plugins] [--cli] [--ui] [--all] [--no-bump]"
  echo ""
  echo "  默认构建 agent + plugins + cli，并自增对应 package 的 patch 版本号"
  echo "  --agent    构建 @downcity/agent"
  echo "  --city     构建 @downcity/city"
  echo "  --services 构建 @downcity/services"
  echo "  --gate     构建 @downcity/gate"
  echo "  --plugins  构建 @downcity/plugins"
  echo "  --cli      构建 Downcity CLI 产品包（内部 city/studio 构建单元 + downcity）"
  echo "  --ui       构建 @downcity/ui"
  echo "  --all      构建全部 packages（agent + city + services + gate + plugins + ui + cli）"
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
    if [[ "$selected" == "cli" ]]; then
      local has_agent=false
      local has_plugins=false
      local item
      for item in "${resolved[@]}"; do
        if [[ "$item" == "agent" ]]; then
          has_agent=true
        fi
        if [[ "$item" == "plugins" ]]; then
          has_plugins=true
        fi
      done
      if [[ "$has_agent" == false ]]; then
        resolved+=("agent")
      fi
      if [[ "$has_plugins" == false ]]; then
        resolved+=("plugins")
      fi
      for dep in city services gate; do
        local has_dep=false
        local dep_item
        for dep_item in "${resolved[@]}"; do
          if [[ "$dep_item" == "$dep" ]]; then
            has_dep=true
            break
          fi
        done
        if [[ "$has_dep" == false ]]; then
          resolved+=("$dep")
        fi
      done
      break
    fi
    if [[ "$selected" == "services" ]]; then
      local has_city=false
      local item
      for item in "${resolved[@]}"; do
        if [[ "$item" == "city" ]]; then
          has_city=true
          break
        fi
      done
      if [[ "$has_city" == false ]]; then
        resolved+=("city")
      fi
    fi
    if [[ "$selected" == "plugins" ]]; then
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
  if [[ "$pkg" == "cli" ]]; then
    echo "--- Downcity CLI products ---"
    if command -v pnpm >/dev/null 2>&1; then
      pnpm -C "cli/city" build
      pnpm -C "cli/studio" build
      pnpm -C "products/console" build
      pnpm -C "cli/downcity" build
    else
      npm --prefix "cli/city" run build
      npm --prefix "cli/studio" run build
      npm --prefix "products/console" run build
      npm --prefix "cli/downcity" run build
    fi
    return 0
  fi
  echo "--- @downcity/$pkg ---"
  if command -v pnpm >/dev/null 2>&1; then
    pnpm -C "packages/$pkg" build
  else
    npm --prefix "packages/$pkg" run build
  fi
}

install_cli_globally() {
  local deploy_dir
  local npm_prefix
  local global_modules
  local global_bin
  local package_dir
  deploy_dir="$(mktemp -d "${TMPDIR:-/tmp}/downcity-cli-deploy.XXXXXX")"
  trap 'rm -rf "$deploy_dir"' RETURN

  npm_prefix="$(npm prefix -g)"
  global_modules="$npm_prefix/lib/node_modules"
  global_bin="$npm_prefix/bin"
  package_dir="$global_modules/downcity"

  pnpm --filter downcity deploy --legacy "$deploy_dir"

  # 关键点（中文）：npm 11 对本地目录执行 install -g 时偶发 Arborist 崩溃。
  # 这里沿用 pnpm deploy 产物，但手动落盘到 npm 全局目录，并重建命令入口。
  mkdir -p "$global_modules" "$global_bin"
  rm -rf "$package_dir"
  cp -R "$deploy_dir" "$package_dir"
  chmod +x "$package_dir/bin/studio/index.js"
  chmod +x "$package_dir/bin/city/index.js"

  rm -f "$global_bin/studio" "$global_bin/city" 2>/dev/null || true
  ln -s "../lib/node_modules/downcity/bin/studio/index.js" "$global_bin/studio"
  ln -s "../lib/node_modules/downcity/bin/city/index.js" "$global_bin/city"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent)    add_package "agent" ;;
    --city)     add_package "city" ;;
    --services) add_package "services" ;;
    --gate)     add_package "gate" ;;
    --plugins)  add_package "plugins" ;;
    --cli)      add_package "cli" ;;
    --ui)       add_package "ui" ;;
    --all)      PACKAGES=("agent" "city" "services" "gate" "plugins" "ui" "cli") ; shift ; continue ;;
    --no-bump)  BUMP=false ;;
    -h|--help)  usage ;;
    *)          usage ;;
  esac
  shift
done

if [[ ${#PACKAGES[@]} -eq 0 ]]; then
  PACKAGES=("agent" "plugins" "cli")
fi
normalize_packages
resolve_build_packages

if $BUMP; then
  echo "==> patch bump: ${PACKAGES[*]}"
  for pkg in "${PACKAGES[@]}"; do
    if [[ "$pkg" == "cli" ]]; then
      node "$ROOT_DIR/scripts/bump-package-version.mjs" "$ROOT_DIR/cli/city/package.json"
      node "$ROOT_DIR/scripts/bump-package-version.mjs" "$ROOT_DIR/cli/studio/package.json"
      node "$ROOT_DIR/scripts/bump-package-version.mjs" "$ROOT_DIR/cli/downcity/package.json"
    else
      node "$ROOT_DIR/scripts/bump-package-version.mjs" "$ROOT_DIR/packages/$pkg/package.json"
    fi
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

# 构建 cli 后重新全局安装
if [[ " ${PACKAGES[*]} " =~ " cli " ]]; then
  echo ""
  echo "==> 全局安装 Downcity CLI ..."
  install_cli_globally
fi
