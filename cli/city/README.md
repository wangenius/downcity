# @downcity/city-cli

`@downcity/city-cli` 是 Downcity 的 City 管理命令包。

- `city`：City 管理工具，用来初始化、启动、检查、配置和运维 City runtime、Console、模型池与服务资源。

## 安装

```bash
npm install -g @downcity/city-cli
```

安装后可直接检查入口：

```bash
city -v
```

如果希望一次安装 `city` 和 `studio`，请使用聚合包：

```bash
npm install -g downcity
```

## 目录边界

```text
cli/city/
├── src/
│   ├── city/     # City 管理命令与交互式管理界面
│   └── shared/   # City CLI 输出、参数解析与通用命令工具
└── public/       # Console 静态资源
```

`terminal` 不再作为顶层目录或产品概念存在；原交互式管理能力已经收敛到 `city` 入口下。
