#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENT_PKG="$ROOT_DIR/packages/agent/package.json"
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
  rm -f /opt/homebrew/bin/city /opt/homebrew/bin/downcity 2>/dev/null; npm install -g "$ROOT_DIR/packages/city"
}

if [[ "$BUILD_SCOPE" == "all" || "$BUILD_SCOPE" == "city" ]]; then
  node "$ROOT_DIR/scripts/bump-package-version.mjs" "$PLUGINS_PKG"
  node "$ROOT_DIR/scripts/bump-package-version.mjs" "$CITY_PKG"
fi

if [[ "$BUILD_SCOPE" == "all" ]]; then
  # 构建顺序：agent → plugins → city（city 依赖 agent 与 plugins）
  run_build "$ROOT_DIR/packages/agent"
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
run_build "$ROOT_DIR/packages/plugins"
run_build "$ROOT_DIR/products/console"
run_build "$ROOT_DIR/packages/city"
