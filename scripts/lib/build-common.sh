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
  local source_dir
  local legacy_command

  npm_prefix="$(npm prefix -g)"
  global_modules="$npm_prefix/lib/node_modules"
  global_bin="$npm_prefix/bin"
  package_dir="$global_modules/downcity"
  source_dir="$workspace_root/cli/downcity"

  if [[ ! -f "$source_dir/bin/town/index.js" || ! -f "$source_dir/bin/city/index.js" ]]; then
    echo "Missing Downcity CLI build output. Run cli/downcity build first." >&2
    return 1
  fi

  mkdir -p "$global_modules" "$global_bin" "$package_dir"

  # 关键点（中文）：日常 patch build 已经构建好了 cli/downcity，不需要再 `pnpm deploy`
  # 联网解析依赖。只更新 CLI 代码与静态资源，并复用全局安装中已有的 node_modules。
  if [[ -d "$package_dir/node_modules" ]]; then
    rm -rf \
      "$package_dir/bin" \
      "$package_dir/city" \
      "$package_dir/town" \
      "$package_dir/public" \
      "$package_dir/README.md" \
      "$package_dir/package.json"
    cp -R "$source_dir/bin" "$package_dir/bin"
    cp -R "$source_dir/city" "$package_dir/city"
    cp -R "$source_dir/town" "$package_dir/town"
    cp -R "$source_dir/public" "$package_dir/public"
    cp "$source_dir/README.md" "$package_dir/README.md"
    cp "$source_dir/package.json" "$package_dir/package.json"
  else
    # 关键点（中文）：首次全局安装没有依赖目录时，仍需要 deploy 生成完整依赖树。
    deploy_dir="$(mktemp -d "${TMPDIR:-/tmp}/downcity-cli-deploy.XXXXXX")"
    trap 'rm -rf "$deploy_dir"' RETURN

    pnpm --filter downcity deploy --legacy "$deploy_dir"
    rm -rf "$package_dir"
    cp -R "$deploy_dir" "$package_dir"
  fi

  chmod +x "$package_dir/bin/town/index.js"
  chmod +x "$package_dir/bin/city/index.js"

  legacy_command="stu""dio"
  rm -f "$global_bin/town" "$global_bin/$legacy_command" "$global_bin/city" 2>/dev/null || true
  ln -s "../lib/node_modules/downcity/bin/town/index.js" "$global_bin/town"
  ln -s "../lib/node_modules/downcity/bin/city/index.js" "$global_bin/city"
}
