#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENT_PKG="$ROOT_DIR/packages/agent/package.json"
CITY_PKG="$ROOT_DIR/packages/city/package.json"
SERVICES_PKG="$ROOT_DIR/packages/services/package.json"
GATE_PKG="$ROOT_DIR/packages/gate/package.json"
PLUGINS_PKG="$ROOT_DIR/packages/plugins/package.json"
STUDIO_CLI_PKG="$ROOT_DIR/packages/studio-cli/package.json"
BUILD_SCOPE="${1:-all}"

case "$BUILD_SCOPE" in
  all|studio-cli)
    ;;
  *)
    echo "Unsupported build scope: $BUILD_SCOPE"
    echo "Usage: bash ./scripts/build.sh [all|studio-cli]"
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

install_studio_cli_globally() {
  local deploy_dir
  local npm_prefix
  local global_modules
  local global_bin
  local package_scope_dir
  local package_dir
  local cli_entry
  deploy_dir="$(mktemp -d "${TMPDIR:-/tmp}/downcity-studio-cli-deploy.XXXXXX")"
  trap 'rm -rf "$deploy_dir"' RETURN

  npm_prefix="$(npm prefix -g)"
  global_modules="$npm_prefix/lib/node_modules"
  global_bin="$npm_prefix/bin"
  package_scope_dir="$global_modules/@downcity"
  package_dir="$package_scope_dir/studio-cli"
  cli_entry="$package_dir/bin/cli/Index.js"

  pnpm --filter @downcity/studio-cli deploy --legacy "$deploy_dir"

  # 关键点（中文）：npm 11 对本地目录执行 install -g 时偶发 Arborist 崩溃。
  # 这里沿用 pnpm deploy 产物，但手动落盘到 npm 全局目录，并重建命令入口。
  mkdir -p "$package_scope_dir" "$global_bin"
  rm -rf "$package_dir"
  cp -R "$deploy_dir" "$package_dir"
  chmod +x "$cli_entry"

  rm -f "$global_bin/studio" "$global_bin/downcity" 2>/dev/null || true
  ln -s "../lib/node_modules/@downcity/studio-cli/bin/cli/Index.js" "$global_bin/studio"
  ln -s "../lib/node_modules/@downcity/studio-cli/bin/cli/Index.js" "$global_bin/downcity"
}

if [[ "$BUILD_SCOPE" == "all" || "$BUILD_SCOPE" == "studio-cli" ]]; then
  node "$ROOT_DIR/scripts/bump-package-version.mjs" "$PLUGINS_PKG"
  node "$ROOT_DIR/scripts/bump-package-version.mjs" "$CITY_PKG"
  node "$ROOT_DIR/scripts/bump-package-version.mjs" "$SERVICES_PKG"
  node "$ROOT_DIR/scripts/bump-package-version.mjs" "$GATE_PKG"
  node "$ROOT_DIR/scripts/bump-package-version.mjs" "$STUDIO_CLI_PKG"
fi

if [[ "$BUILD_SCOPE" == "all" ]]; then
  # 构建顺序：city/services/gate 先于 studio-cli，studio-cli 依赖这些城市基础包。
  run_build "$ROOT_DIR/packages/agent"
  run_build "$ROOT_DIR/packages/city"
  run_build "$ROOT_DIR/packages/services"
  run_build "$ROOT_DIR/packages/gate"
  run_build "$ROOT_DIR/packages/plugins"
  run_build "$ROOT_DIR/packages/ui"
  run_build "$ROOT_DIR/homepage"
  run_build "$ROOT_DIR/products/console"
  run_build "$ROOT_DIR/packages/studio-cli"
  install_studio_cli_globally
  exit 0
fi

# build:studio-cli — 仅构建 studio 交付链路
run_build "$ROOT_DIR/packages/agent"
run_build "$ROOT_DIR/packages/city"
run_build "$ROOT_DIR/packages/services"
run_build "$ROOT_DIR/packages/gate"
run_build "$ROOT_DIR/packages/plugins"
run_build "$ROOT_DIR/products/console"
run_build "$ROOT_DIR/packages/studio-cli"
install_studio_cli_globally
