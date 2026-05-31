# Dokploy 部署 Downcity Node 街区

## 部署配置

推荐在 Dokploy 里使用 Compose 模式，Compose 文件路径填写：

```txt
./docker-compose.yml
```

镜像构建逻辑已经内联在 `docker-compose.yml` 中，不需要单独配置 Dockerfile。

Dokploy 里必须配置这两个稳定的 bootstrap secret：

```env
DOWNCITY_CITY_ADMIN_SECRET_KEY=admin_xxx
DOWNCITY_CITY_TOKEN_SIGNING_KEY=sign_xxx
```

`HOST`、`PORT` 和 `DOWNCITY_CITY_DATABASE_URL` 已经写在 `docker-compose.yml` 中。容器内数据库路径是：

```env
DOWNCITY_CITY_DATABASE_URL=file:/data/downcity.sqlite
```

`/data` 已经配置为持久化 volume。SQLite 数据库、town、model、auth session、usage、payment 和 City env 都会保存在这里。

容器启动命令已经写在 Compose 的内联构建配置里：

```bash
pnpm -C cities/node start
```

## API Key 管理

模型 API key 不建议放 Dokploy env。部署完成后，通过 City Admin API 写入数据库：

```bash
curl -X POST https://your-domain/v1/env/upsert \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer YOUR_DOWNCITY_CITY_ADMIN_SECRET_KEY' \
  -d '{"key":"MOONSHOT_API_KEY","value":"your_api_key"}'
```

之后 Runtime handler 里的 `ctx.env.MOONSHOT_API_KEY` 会从 City 数据库读取。

`DOWNCITY_CITY_ADMIN_SECRET_KEY` 和 `DOWNCITY_CITY_TOKEN_SIGNING_KEY` 是启动级 bootstrap secret，生产环境必须在 Dokploy env 中固定配置。

## 本地验证

部署后先验证健康检查：

```bash
curl https://your-domain/health
```

只用 IP 和端口时：

```txt
curl http://your-vps-ip:43127/health
```

如果这里超时，说明 Dokploy 服务没有对外暴露、VPS 防火墙没放行 `43127`，或还没有绑定可访问的域名。

## 本地运行

本地开发仍然可以直接启动：

```bash
pnpm -C cities/node start
```

默认监听 `127.0.0.1:43127`，并使用 `cities/node/data.sqlite`。如果要模拟容器路径，可以临时传入：

```bash
HOST=0.0.0.0 DOWNCITY_CITY_DATABASE_URL=file:/tmp/downcity.sqlite pnpm -C cities/node start
```
