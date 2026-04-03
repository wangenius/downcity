#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PACKAGE_JSON="$ROOT_DIR/packages/downcity/package.json"
BUILD_SCOPE="${1:-all}"

##
# 仓库级构建入口。
#
# 关键点（中文）
# - `all`：执行完整仓库构建，包含版本号自增、所有前端产物、CLI 包构建与全局安装。
# - `downcity`：只执行 downcity 交付链路，即 `console-ui -> packages/downcity`。
##
case "$BUILD_SCOPE" in
  all|downcity)
    ;;
  *)
    echo "Unsupported build scope: $BUILD_SCOPE"
    echo "Usage: bash ./scripts/build.sh [all|downcity]"
    exit 1
    ;;
esac

##
# 统一执行包构建。
#
# 关键点（中文）
# - 优先使用 bun，其次 pnpm，最后回退 npm。
# - 所有子构建都通过这个函数触发，避免同一套分支逻辑重复多次。
##
run_build() {
  local project_dir="$1"

  if command -v bun >/dev/null 2>&1; then
    (cd "$project_dir" && bun run build)
  elif command -v pnpm >/dev/null 2>&1; then
    pnpm -C "$project_dir" build
  else
    npm --prefix "$project_dir" run build
  fi
}

##
# 统一执行 downcity CLI 的全局安装。
#
# 关键点（中文）
# - `city` / `downcity` 命令来自全局安装，因此完整构建后需要刷新全局包。
##
install_downcity_globally() {
  npm install -g "$ROOT_DIR/packages/downcity"
}

if [[ "$BUILD_SCOPE" == "all" || "$BUILD_SCOPE" == "downcity" ]]; then
  node "$ROOT_DIR/scripts/bump-package-version.mjs" "$PACKAGE_JSON"
fi

if [[ "$BUILD_SCOPE" == "all" ]]; then
  # 关键点（中文）：完整构建顺序固定为：
  # 1) 先构建 @downcity/ui，保证 workspace 消费方拿到最新 dist
  # 2) 再构建 homepage
  # 3) 再构建 console-ui（输出到 packages/downcity/public）
  # 4) 最后构建 downcity package（tsc + copy assets）
  run_build "$ROOT_DIR/packages/downcity-ui"
  run_build "$ROOT_DIR/homepage"
  run_build "$ROOT_DIR/console-ui"
  run_build "$ROOT_DIR/packages/downcity"
  install_downcity_globally
  exit 0
fi

# 关键点（中文）：`build:downcity` 只覆盖 downcity 的交付链路：
# 1) 先构建 console-ui，产物直接写入 packages/downcity/public
# 2) 再构建 packages/downcity，生成 CLI/runtime 的 bin 目录
run_build "$ROOT_DIR/console-ui"
run_build "$ROOT_DIR/packages/downcity"
