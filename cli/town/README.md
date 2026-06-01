# cli/town

`cli/town` 是 Downcity 仓库内部的本机 Agent 宿主与 Agent Plugin 管理命令构建单元。

```bash
npm install -g downcity
town -v
```

安装 `downcity` 后会同时得到：

- `town`：本机 Agent 宿主、Agent Plugin 管理与 City 连接入口。
- `city`：City 服务、模型、账号、计费等共享资源管理入口。

常用入口：

```bash
town
town city status
town agent
town plugin
```

`cli/town` 自身标记为 private，不作为独立 npm 包发布。
