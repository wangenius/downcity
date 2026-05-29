#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENT_PKG="$ROOT_DIR/packages/agent/package.json"
INFRA_PKG="$ROOT_DIR/packages/infra/package.json"
SERVICES_PKG="$ROOT_DIR/packages/services/package.json"
CONDUIT_PKG="$ROOT_DIR/packages/conduit/package.json"
PLUGINS_PKG="$ROOT_DIR/packages/plugins/package.json"
CITY_PKG="$ROOT_DIR/packages/city/package.json"
BUILD_SCOPE="${1:-all}"

case "$BUILD_SCOPE" in
  all|city)
    ;;
  *)
    echo "Unsupported build scope: $BUILD_SCOPE"
    echo "Usage: bash ./scripts/build.sh [all|city]"
    exit 1
    ;;
esac

run_build() {
  local project_dir="$1"
  if command -v pnpm >/dev/null 2>&1; then
    pnpm -C "$project_dir" build
  else
    npm --prefix "$project_dir" run build
  fi
}

install_city_globally() {
  local deploy_dir
  local npm_prefix
  local global_modules
  local global_bin
  local package_scope_dir
  local package_dir
  local cli_entry
  deploy_dir="$(mktemp -d "${TMPDIR:-/tmp}/downcity-city-deploy.XXXXXX")"
  trap 'rm -rf "$deploy_dir"' RETURN

  npm_prefix="$(npm prefix -g)"
  global_modules="$npm_prefix/lib/node_modules"
  global_bin="$npm_prefix/bin"
  package_scope_dir="$global_modules/@downcity"
  package_dir="$package_scope_dir/city"
  cli_entry="$package_dir/bin/cli/Index.js"

  pnpm --filter @downcity/city deploy --legacy "$deploy_dir"

  # 关键点（中文）：npm 11 对本地目录执行 install -g 时偶发 Arborist 崩溃。
  # 这里沿用 pnpm deploy 产物，但手动落盘到 npm 全局目录，并重建命令入口。
  mkdir -p "$package_scope_dir" "$global_bin"
  rm -rf "$package_dir"
  cp -R "$deploy_dir" "$package_dir"
  chmod +x "$cli_entry"

  rm -f "$global_bin/city" "$global_bin/downcity" 2>/dev/null || true
  ln -s "../lib/node_modules/@downcity/city/bin/cli/Index.js" "$global_bin/city"
  ln -s "../lib/node_modules/@downcity/city/bin/cli/Index.js" "$global_bin/downcity"
}

if [[ "$BUILD_SCOPE" == "all" || "$BUILD_SCOPE" == "city" ]]; then
  node "$ROOT_DIR/scripts/bump-package-version.mjs" "$PLUGINS_PKG"
  node "$ROOT_DIR/scripts/bump-package-version.mjs" "$INFRA_PKG"
  node "$ROOT_DIR/scripts/bump-package-version.mjs" "$SERVICES_PKG"
  node "$ROOT_DIR/scripts/bump-package-version.mjs" "$CONDUIT_PKG"
  node "$ROOT_DIR/scripts/bump-package-version.mjs" "$CITY_PKG"
fi

if [[ "$BUILD_SCOPE" == "all" ]]; then
  # 构建顺序：infra/services/conduit 先于 city，city 依赖这些城市基础包。
  run_build "$ROOT_DIR/packages/agent"
  run_build "$ROOT_DIR/packages/infra"
  run_build "$ROOT_DIR/packages/services"
  run_build "$ROOT_DIR/packages/conduit"
  run_build "$ROOT_DIR/packages/plugins"
  run_build "$ROOT_DIR/packages/ui"
  run_build "$ROOT_DIR/homepage"
  run_build "$ROOT_DIR/products/console"
  run_build "$ROOT_DIR/packages/city"
  install_city_globally
  exit 0
fi

# build:city — 仅构建 city 交付链路
run_build "$ROOT_DIR/packages/agent"
run_build "$ROOT_DIR/packages/infra"
run_build "$ROOT_DIR/packages/services"
run_build "$ROOT_DIR/packages/conduit"
run_build "$ROOT_DIR/packages/plugins"
run_build "$ROOT_DIR/products/console"
run_build "$ROOT_DIR/packages/city"
install_city_globally
