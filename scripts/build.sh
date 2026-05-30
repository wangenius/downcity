#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENT_PKG="$ROOT_DIR/packages/agent/package.json"
CITY_PKG="$ROOT_DIR/packages/city/package.json"
SERVICES_PKG="$ROOT_DIR/packages/services/package.json"
GATE_PKG="$ROOT_DIR/packages/gate/package.json"
PLUGINS_PKG="$ROOT_DIR/packages/plugins/package.json"
CITY_CLI_PKG="$ROOT_DIR/cli/city/package.json"
STUDIO_CLI_PKG="$ROOT_DIR/cli/studio/package.json"
DOWNCITY_CLI_PKG="$ROOT_DIR/cli/downcity/package.json"
BUILD_SCOPE="${1:-all}"

case "$BUILD_SCOPE" in
  all|cli)
    ;;
  *)
    echo "Unsupported build scope: $BUILD_SCOPE"
    echo "Usage: bash ./scripts/build.sh [all|cli]"
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

if [[ "$BUILD_SCOPE" == "all" || "$BUILD_SCOPE" == "cli" ]]; then
  node "$ROOT_DIR/scripts/bump-package-version.mjs" "$PLUGINS_PKG"
  node "$ROOT_DIR/scripts/bump-package-version.mjs" "$CITY_PKG"
  node "$ROOT_DIR/scripts/bump-package-version.mjs" "$SERVICES_PKG"
  node "$ROOT_DIR/scripts/bump-package-version.mjs" "$GATE_PKG"
  node "$ROOT_DIR/scripts/bump-package-version.mjs" "$CITY_CLI_PKG"
  node "$ROOT_DIR/scripts/bump-package-version.mjs" "$STUDIO_CLI_PKG"
  node "$ROOT_DIR/scripts/bump-package-version.mjs" "$DOWNCITY_CLI_PKG"
fi

if [[ "$BUILD_SCOPE" == "all" ]]; then
  # 构建顺序：city/services/gate 先于 cli，cli 依赖这些城市基础包。
  run_build "$ROOT_DIR/packages/agent"
  run_build "$ROOT_DIR/packages/city"
  run_build "$ROOT_DIR/packages/services"
  run_build "$ROOT_DIR/packages/gate"
  run_build "$ROOT_DIR/packages/plugins"
  run_build "$ROOT_DIR/packages/ui"
  run_build "$ROOT_DIR/homepage"
  run_build "$ROOT_DIR/products/console"
  run_build "$ROOT_DIR/cli/city"
  run_build "$ROOT_DIR/cli/studio"
  run_build "$ROOT_DIR/cli/downcity"
  install_cli_globally
  exit 0
fi

# build:cli — 仅构建 CLI 交付链路
run_build "$ROOT_DIR/packages/agent"
run_build "$ROOT_DIR/packages/city"
run_build "$ROOT_DIR/packages/services"
run_build "$ROOT_DIR/packages/gate"
run_build "$ROOT_DIR/packages/plugins"
run_build "$ROOT_DIR/products/console"
run_build "$ROOT_DIR/cli/city"
run_build "$ROOT_DIR/cli/studio"
run_build "$ROOT_DIR/cli/downcity"
install_cli_globally
