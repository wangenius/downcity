#!/usr/bin/env bash
set -euo pipefail

# 交互式发布脚本：用于发布 @downcity/ui。
# 关键点（中文）：
# 1) 只修改 packages/downcity-ui/package.json 的版本号
# 2) 通过提交并推送触发 GitHub Actions 自动发布

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
  echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1"
}

get_current_version() {
  node -p "require('./packages/downcity-ui/package.json').version"
}

set_new_version() {
  local new_version=$1
  node --input-type=module - "$new_version" <<'NODE'
import fs from 'node:fs';

const newVersion = process.argv[2];
if (!newVersion) {
  console.error('Missing new version');
  process.exit(1);
}

const file = 'packages/downcity-ui/package.json';
const raw = fs.readFileSync(file, 'utf8');
const pkg = JSON.parse(raw);
pkg.version = newVersion;
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
NODE
}

confirm() {
  local prompt=${1:-"确认继续? (y/N): "}
  local ans
  read -r -p "$prompt" ans
  [[ "$ans" =~ ^[Yy]([Ee][Ss])?$ ]]
}

check_git_status() {
  local status
  status=$(git status --porcelain)

  if [[ -n "$status" ]]; then
    print_warning "检测到未提交的变更："
    git status --short
    echo
    if ! confirm "是否继续？这些变更将包含在 UI SDK 发布提交中 (y/N): "; then
      print_error "已取消发布"
      exit 1
    fi
  fi
}

choose_bump_level() {
  local choice
  echo "请选择 @downcity/ui 的版本号提升类型:" >&2
  echo "  1) patch  (修复, x.y.Z+1)" >&2
  echo "  2) minor  (特性, x.Y+1.0)" >&2
  echo "  3) major  (破坏, X+1.0.0)" >&2
  echo >&2
  read -r -p "输入选择 [1-3] (默认: 1): " choice

  case "${choice:-1}" in
    1) echo "patch" ;;
    2) echo "minor" ;;
    3) echo "major" ;;
    *)
      print_warning "无效选择，使用默认值 patch" >&2
      echo "patch"
      ;;
  esac
}

preview_version() {
  local bump_level=$1
  local current_version
  current_version=$(get_current_version)
  local new_version

  case "$bump_level" in
    patch)
      new_version=$(echo "$current_version" | awk -F. '{print $1"."$2"."($3+1)}')
      ;;
    minor)
      new_version=$(echo "$current_version" | awk -F. '{print $1"."($2+1)".0"}')
      ;;
    major)
      new_version=$(echo "$current_version" | awk -F. '{print ($1+1)".0.0"}')
      ;;
  esac

  print_status "当前版本: ${current_version}"
  print_status "新版本: ${new_version} (${bump_level})"
  echo
}

main() {
  print_status "🚀 开始发布 @downcity/ui"
  print_status "当前分支: $(git rev-parse --abbrev-ref HEAD)"
  echo

  check_git_status

  local bump_level
  bump_level=$(choose_bump_level)

  preview_version "$bump_level"

  if ! confirm "确认发布新的 @downcity/ui 版本? (y/N): "; then
    print_warning "已取消发布"
    exit 0
  fi

  local current_version
  current_version=$(get_current_version)
  local new_version

  case "$bump_level" in
    patch)
      new_version=$(echo "$current_version" | awk -F. '{print $1"."$2"."($3+1)}')
      ;;
    minor)
      new_version=$(echo "$current_version" | awk -F. '{print $1"."($2+1)".0"}')
      ;;
    major)
      new_version=$(echo "$current_version" | awk -F. '{print ($1+1)".0.0"}')
      ;;
  esac

  set_new_version "$new_version"

  git add packages/downcity-ui/package.json

  local default_msg="chore: release @downcity/ui v${new_version}"
  local input_msg
  echo
  read -r -p "提交信息 (回车使用默认): " input_msg
  local commit_msg=${input_msg:-$default_msg}

  git commit -m "$commit_msg"
  print_success "已提交: $commit_msg"

  echo
  if confirm "推送到远程仓库? (y/N): "; then
    git push
    print_success "🎉 已推送到远程仓库，CI 将尝试发布 npm 版本 @downcity/ui@${new_version}"
  else
    print_warning "已提交到本地，但未推送到远程"
    print_status "运行 'git push' 手动推送"
  fi
}

trap 'print_error "发布过程中发生错误"; exit 1' ERR

main "$@"
