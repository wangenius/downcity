# downcity

## download

```bash
npm i -g downcity
```

## quick start

```bash
city start
cd /path/to/your-repo
city agent create .
city agent start
```

## troubleshooting

### zsh: permission denied: downcity

这不是 `sudo` / 系统管理员权限问题，通常是因为 `pnpm` 的 `.bin/downcity` 可能是软链到实际入口文件（例如 `.../downcity/bin/main/commands/Index.js`），而目标文件缺少可执行位（`+x`）。

```bash
# 本地依赖安装（仓库内）
chmod +x node_modules/downcity/bin/main/commands/Index.js

# 或者直接用 node 执行（不依赖可执行位）
node node_modules/downcity/bin/main/commands/Index.js agent start .
```

## access

```http
GET http://localhost:3000/health
GET http://localhost:3000/api/status

POST http://localhost:3000/api/execute
Content-Type: application/json

{"instructions":"Say hi"}
```

## debug

By default the runtime logs every LLM request payload (messages + system) to help debugging.

- Disable: set `llm.logMessages=false` in `downcity.json`
