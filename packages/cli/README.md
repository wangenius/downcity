# @downcity/cli

`@downcity/cli` 是 Downcity 的官方命令行包，提供两个可执行入口：

- `studio`：本机 Agent 运行宿主，用来创建、启动、停止、对话和管理本机 Agent。
- `city`：City 管理工具，用来初始化、启动、检查、配置和运维 City runtime、Console、模型池与服务资源。

## 安装

```bash
npm install -g @downcity/cli
```

安装后可直接检查两个入口：

```bash
studio -v
city -v
```

## 目录边界

```text
packages/cli/
├── src/
│   ├── studio/   # 本机 Agent 宿主命令
│   ├── city/     # City 管理命令与交互式管理界面
│   └── shared/   # 两个入口共享的 CLI 输出、参数解析与通用命令工具
└── public/       # Console 静态资源
```

`terminal` 不再作为顶层目录或产品概念存在；原交互式管理能力已经收敛到 `city` 入口下。
