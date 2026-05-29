#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
log()  { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $1"; }

# 加载 .env（如果存在）
if [ -f .env ]; then
  set -a; source .env; set +a
fi

# 1. D1 数据库
DB_NAME="${DATABASE_NAME:-$(grep 'database_name' wrangler.toml | head -1 | sed 's/.*= *"//;s/"//')}"
DB_ID=$(grep 'database_id' wrangler.toml | head -1 | sed 's/.*= *"//;s/"//')

if [ -z "$DB_ID" ]; then
  warn "D1 不存在，创建 $DB_NAME..."
  OUT=$(npx wrangler d1 create "$DB_NAME" 2>&1)
  DB_ID=$(echo "$OUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  if [ -z "$DB_ID" ]; then echo "$OUT"; exit 1; fi
  sed -i '' "s|database_id = \"\"|database_id = \"$DB_ID\"|" wrangler.toml
  log "D1 已创建: $DB_ID"
else
  log "D1: $DB_ID"
fi

# 2. Deploy
log "部署..."
npx wrangler deploy
log "完成"
