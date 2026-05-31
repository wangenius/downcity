#!/usr/bin/env bash

# Downcity 构建脚本公共函数。
#
# 关键点（中文）：
# - 所有仓库级构建脚本共用这里的 pnpm/npm fallback 与 CLI 全局安装逻辑。
# - 避免 build.sh / build-packages.sh 分叉维护，减少 CLI 发布链路漂移。

run_project_build() {
  local project_dir="$1"
  if command -v pnpm >/dev/null 2>&1; then
    pnpm -C "$project_dir" build
  else
    npm --prefix "$project_dir" run build
  fi
}

install_downcity_cli_globally() {
  local workspace_root="$1"
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
