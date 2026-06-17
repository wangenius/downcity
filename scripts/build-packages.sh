#!/usr/bin/env bash
set -euo pipefail

# 关键点（中文）：
# 1) 这个脚本负责“packages 级 patch bump + build”，不承担 homepage / console 的全仓交付链路。
# 2) 统一入口支持按包选择：type、shell、agent、city、services、plugins、ui、cli；默认构建 agent + plugins + cli。
# 3) bump 只作用于本次显式选中的 package，避免误改无关包版本号。

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/scripts/lib/build-common.sh"

PACKAGES=()
ALL_PACKAGES=("type" "shell" "agent" "server" "city" "services" "plugins" "ui" "cli")
BUILD_PACKAGES=()
BUMP=true

usage() {
  echo "Usage: npm run patch:build -- [--type] [--shell] [--agent] [--server] [--city] [--services] [--plugins] [--cli] [--ui] [--all] [--no-bump]"
  echo ""
  echo "  默认构建 agent + plugins + cli，并自增对应 package 的 patch 版本号"
  echo "  --type     构建 @downcity/type"
  echo "  --shell    构建 @downcity/shell"
  echo "  --agent    构建 @downcity/agent"
  echo "  --server   构建 @downcity/server"
  echo "  --city     构建 @downcity/city"
  echo "  --services 构建 @downcity/services"
  echo "  --plugins  构建 @downcity/plugins"
  echo "  --cli      构建 Downcity CLI 产品包（内部 city/town 构建单元 + downcity）"
  echo "  --ui       构建 @downcity/ui"
  echo "  --all      构建全部 packages（type + shell + agent + server + city + services + plugins + ui + cli）"
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
      local has_type=false
      local has_shell=false
      local has_agent=false
      local has_plugins=false
      local has_ui=false
      local has_server=false
      local item
      for item in "${resolved[@]}"; do
        if [[ "$item" == "type" ]]; then
          has_type=true
        fi
        if [[ "$item" == "agent" ]]; then
          has_agent=true
        fi
        if [[ "$item" == "shell" ]]; then
          has_shell=true
        fi
        if [[ "$item" == "plugins" ]]; then
          has_plugins=true
        fi
        if [[ "$item" == "ui" ]]; then
          has_ui=true
        fi
        if [[ "$item" == "server" ]]; then
          has_server=true
        fi
      done
      if [[ "$has_type" == false ]]; then
        resolved+=("type")
      fi
      if [[ "$has_shell" == false ]]; then
        resolved+=("shell")
      fi
      if [[ "$has_agent" == false ]]; then
        resolved+=("agent")
      fi
      if [[ "$has_server" == false ]]; then
        resolved+=("server")
      fi
      if [[ "$has_plugins" == false ]]; then
        resolved+=("plugins")
      fi
      if [[ "$has_ui" == false ]]; then
        resolved+=("ui")
      fi
      for dep in city services; do
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
    if [[ "$selected" == "agent" || "$selected" == "city" ]]; then
      local has_type=false
      local has_shell=false
      local item
      for item in "${resolved[@]}"; do
        if [[ "$item" == "type" ]]; then
          has_type=true
        fi
        if [[ "$item" == "shell" ]]; then
          has_shell=true
        fi
      done
      if [[ "$has_type" == false ]]; then
        resolved+=("type")
      fi
      if [[ "$selected" == "agent" && "$has_shell" == false ]]; then
        resolved+=("shell")
      fi
    fi
    if [[ "$selected" == "server" ]]; then
      local has_type=false
      local has_shell=false
      local has_agent=false
      local item
      for item in "${resolved[@]}"; do
        if [[ "$item" == "type" ]]; then
          has_type=true
        fi
        if [[ "$item" == "shell" ]]; then
          has_shell=true
        fi
        if [[ "$item" == "agent" ]]; then
          has_agent=true
        fi
      done
      if [[ "$has_type" == false ]]; then
        resolved+=("type")
      fi
      if [[ "$has_shell" == false ]]; then
        resolved+=("shell")
      fi
      if [[ "$has_agent" == false ]]; then
        resolved+=("agent")
      fi
    fi
    if [[ "$selected" == "services" ]]; then
      local has_type=false
      local has_city=false
      local item
      for item in "${resolved[@]}"; do
        if [[ "$item" == "type" ]]; then
          has_type=true
        fi
        if [[ "$item" == "city" ]]; then
          has_city=true
        fi
      done
      if [[ "$has_type" == false ]]; then
        resolved+=("type")
      fi
      if [[ "$has_city" == false ]]; then
        resolved+=("city")
      fi
    fi
    if [[ "$selected" == "plugins" ]]; then
      local has_type=false
      local has_shell=false
      local has_agent=false
      local item
      for item in "${resolved[@]}"; do
        if [[ "$item" == "type" ]]; then
          has_type=true
        fi
        if [[ "$item" == "shell" ]]; then
          has_shell=true
        fi
        if [[ "$item" == "agent" ]]; then
          has_agent=true
        fi
      done
      if [[ "$has_type" == false ]]; then
        resolved+=("type")
      fi
      if [[ "$has_shell" == false ]]; then
        resolved+=("shell")
      fi
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
    run_project_build "$ROOT_DIR/cli/city"
    run_project_build "$ROOT_DIR/cli/town"
    run_project_build "$ROOT_DIR/cli/downcity"
    return 0
  fi
  echo "--- @downcity/$pkg ---"
  run_project_build "$ROOT_DIR/packages/$pkg"
}

should_sync_global_cli() {
  local pkg
  for pkg in "${PACKAGES[@]}"; do
    case "$pkg" in
      agent|city|plugins|ui|cli|server)
        return 0
        ;;
    esac
  done
  return 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)         shift ; continue ;;
    --type)     add_package "type" ;;
    --shell)    add_package "shell" ;;
    --agent)    add_package "agent" ;;
    --server)   add_package "server" ;;
    --city)     add_package "city" ;;
    --services) add_package "services" ;;
    --plugins)  add_package "plugins" ;;
    --cli)      add_package "cli" ;;
    --ui)       add_package "ui" ;;
    --all)      PACKAGES=("type" "shell" "agent" "server" "city" "services" "plugins" "ui" "cli") ; shift ; continue ;;
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
      node "$ROOT_DIR/scripts/bump-package-version.mjs" "$ROOT_DIR/cli/town/package.json"
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

# patch build 后，只要本次改动会影响全局 town/city 的交付，就先补齐 CLI 产物，再同步全局安装。
if should_sync_global_cli; then
  if [[ ! " ${BUILD_PACKAGES[*]} " =~ " cli " ]]; then
    echo ""
    echo "==> 刷新 Downcity CLI 交付产物 ..."
    run_build "cli"
  fi

  echo ""
  echo "==> 全局安装 Downcity CLI ..."
  install_downcity_cli_globally "$ROOT_DIR"
fi
