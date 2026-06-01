# cli/city

`cli/city` 是 Downcity 仓库内部的 City 管理命令构建单元。

- `city`：City 管理工具，用来连接已部署的 City，管理账号、共享模型目录、服务环境与资源数据。

## 安装

用户安装请使用 `downcity`：

```bash
npm install -g downcity
```

安装后可直接检查入口：

```bash
city -v
```

`cli/city` 自身标记为 private，不作为独立 npm 包发布。

## 目录边界

```text
cli/city/
├── src/
│   ├── admin/    # 管理员视角的 City 资源操作
│   ├── auth/     # City 连接、身份选择与登录
│   ├── core/     # City CLI 会话、更新与终端 UI 工具
│   ├── user/     # 用户视角的 City 资源操作
│   └── shared/   # City CLI 输出、参数解析与通用命令工具
```

`terminal` 不再作为顶层目录或产品概念存在；原交互式管理能力已经收敛到 `city` 入口下。
