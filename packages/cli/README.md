# downcity

`downcity` 是 Downcity 的全局安装聚合包。

```bash
npm install -g downcity
downcity -v
```

安装后会得到 `city` / `downcity` 与 `fed` / `downfed` 两组命令：

- `fed` 创建、部署和管理 Federation；Local Node.js 和 Cloudflare Workers 都通过 `fed deploy` 部署。
- `city` 管理本机 Agent、插件、chat 与 Federation 用户登录态。

```bash
fed create ./my-fed
cd my-fed
pnpm install
fed deploy
fed
```

`fed create` 默认生成 Local Node.js + SQLite 项目。Local deploy 会自动注入并保存 admin key。无参数执行 `fed` 会进入系统级 Federation 管理面板，已部署实例不依赖当前工作目录。
