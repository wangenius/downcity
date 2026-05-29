# Dokploy 部署 Downcity Product Server

## 部署配置

推荐在 Dokploy 里使用 Compose 模式，Compose 文件路径填写：

```txt
./docker-compose.yml
```

镜像构建逻辑已经内联在 `docker-compose.yml` 中，不需要单独配置 Dockerfile。

Dokploy 里只需要配置这两个环境变量：

```env
DOWNCITY_INFRA_ADMIN_SECRET_KEY=admin_xxx
DOWNCITY_INFRA_TOKEN_SIGNING_KEY=sign_xxx
```

`HOST`、`PORT` 和 `DOWNCITY_INFRA_DATABASE_URL` 已经写在 `docker-compose.yml` 中。`/data` 已经配置为持久化 volume。SQLite 数据库、product、model、auth session、usage、payment 和 InfraRuntime env 都会保存在这里。

容器启动命令已经写在 Compose 的内联构建配置里：

```bash
pnpm -C blocks/node start
```

## API Key 管理

模型 API key 不建议放 Dokploy env。部署完成后，通过 InfraRuntime Admin API 写入数据库：

```bash
curl -X POST https://your-domain/v1/env/upsert \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer YOUR_DOWNCITY_INFRA_ADMIN_SECRET_KEY' \
  -d '{"key":"MOONSHOT_API_KEY","value":"your_api_key"}'
```

之后 Runtime handler 里的 `ctx.env.MOONSHOT_API_KEY` 会从 InfraRuntime 数据库读取。

`DOWNCITY_INFRA_ADMIN_SECRET_KEY` 和 `DOWNCITY_INFRA_TOKEN_SIGNING_KEY` 是启动级 bootstrap secret，生产环境必须在 Dokploy env 中固定配置。

## 本地 Client 连接 VPS

本地运行：

```bash
npm run client
```

启动后在 `server URL` 输入远程 InfraRuntime 地址。可以只输入 VPS IP：

```txt
1.2.3.4
```

client 会自动补成：

```txt
http://1.2.3.4:43127
```

如果已经绑定域名，也可以输入完整地址：

```txt
https://your-domain
```

这个地址会缓存到 `~/.downcity/product-client-config.json`。之后可以在 CLI 里用 `/base` 修改。

如果 terminal 提示 health 失败，可以先在本机验证：

```bash
curl http://your-domain/health
```

只用 IP 和端口时：

```bash
curl http://your-vps-ip:43127/health
```

如果这里超时，说明 Dokploy 服务没有对外暴露、VPS 防火墙没放行 `43127`，或还没有绑定可访问的域名。
