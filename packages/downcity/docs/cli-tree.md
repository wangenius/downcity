# Downcity CLI 树

本文档按当前源码整理 `packages/downcity` 的 CLI 命令树，重点说明：

- 一级命令
- 二级命令
- 实现文件
- 固定注册 / 动态注册

## 1. 总入口

- 入口文件：[`packages/downcity/src/main/modules/cli/Index.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/Index.ts)
- 根命令通过 `commander` 注册
- 命令来源分两类：
  - 固定注册：在 `src/main/modules/cli/*` 中显式装配
  - 动态注册：从 service / plugin 注册表自动生成

## 2. 一级命令总览

| 一级命令 | 类型 | 说明 | 主实现入口 |
| --- | --- | --- | --- |
| `init` | 固定注册 | 初始化 city 全局配置 | [`IndexConsoleCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/IndexConsoleCommand.ts) |
| `start` | 固定注册 | 启动 city runtime，可选同时启动 Console | [`IndexConsoleCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/IndexConsoleCommand.ts) |
| `stop` | 固定注册 | 停止 Console、city runtime 与受管 agent | [`IndexConsoleCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/IndexConsoleCommand.ts) |
| `restart` | 固定注册 | 重启 city runtime 并恢复受管 agent，再拉起 Console | [`IndexConsoleCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/IndexConsoleCommand.ts) |
| `status` | 固定注册 | 查看 city runtime / Console / managed agents 状态 | [`IndexConsoleCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/IndexConsoleCommand.ts) |
| `console` | 固定注册 | 管理 Console 模块进程 | [`IndexConsoleCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/IndexConsoleCommand.ts) |
| `config` | 固定注册 | 管理项目 `downcity.json` 和 alias | [`Config.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/Config.ts) |
| `model` | 固定注册 | 管理 city 全局模型池 | [`Model.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/Model.ts) |
| `agent` | 固定注册 | 管理 Agent 项目和 agent daemon | [`IndexAgentCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/IndexAgentCommand.ts) |
| `env` | 固定注册 | 管理 Console Env 条目（list/set/delete） | [`Env.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/Env.ts) |
| `service` | 固定注册 | 查看静态 service catalog，并提供高级 agent 定向入口 | [`Services.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/Services.ts) |
| `plugin` | 固定注册 | 查看静态 plugin catalog，并提供高级 action 入口 | [`Plugins.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/Plugins.ts) |
| `chat` | 动态注册 | chat service actions | [`ServiceCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/service/ServiceCommand.ts) |
| `task` | 动态注册 | task service actions | [`ServiceCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/service/ServiceCommand.ts) |
| `memory` | 动态注册 | memory service actions | [`ServiceCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/service/ServiceCommand.ts) |
| `skill` | 动态注册 | skill plugin actions | [`PluginCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/plugin/PluginCommand.ts) |
| `web` | 动态注册 | web plugin actions | [`PluginCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/plugin/PluginCommand.ts) |
| `asr` | 动态注册 | asr plugin actions | [`PluginCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/plugin/PluginCommand.ts) |
| `tts` | 动态注册 | tts plugin actions | [`PluginCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/plugin/PluginCommand.ts) |

## 3. 固定注册命令树

### 3.1 city runtime / Console

来源：

- 命令装配：[`IndexConsoleCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/IndexConsoleCommand.ts)
- city runtime 进程控制：[`IndexConsoleProcess.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/IndexConsoleProcess.ts)
- Console 进程控制：[`Console.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/Console.ts)
- 状态展示：[`IndexConsoleStatus.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/IndexConsoleStatus.ts)
- 初始化：[`ConsoleInit.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/ConsoleInit.ts)

子树：

```text
city init
city start [-a|--all|--console]
city stop
city restart
city status
city console [start|stop|restart|status|run]
```

说明：

- `city start` 只启动 city runtime
- `city start -a` / `city start --console` 同时启动 city runtime 和 Console
- `city console start` 只启动 Console，但要求 city runtime 已经启动
- `city run` 与 `city console run` 都是内部命令，不在公开 help 中展示

### 3.2 agent

来源：

- 命令装配：[`IndexAgentCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/IndexAgentCommand.ts)
- 选择与列表：[`AgentSelection.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/AgentSelection.ts)
- 项目初始化：[`Init.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/Init.ts)
- daemon 启动：[`Start.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/Start.ts)
- 前台运行：[`Run.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/Run.ts)
- daemon 状态：[`Status.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/Status.ts)
- daemon 重启：[`Restart.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/Restart.ts)

子树：

```text
city agent create [path]
city agent list [--running] [--json]
city agent start [path] [--foreground]
city agent chat [--to <name>] [--message <text>] [--json]
city agent status [path]
city agent doctor [path] [--fix]
city agent restart [path]
```

### 3.3 config

来源：

- [`Config.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/Config.ts)
- alias 子逻辑：[`Alias.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/Alias.ts)

子树：

```text
city config get [keyPath]
city config set <keyPath> <value>
city config unset <keyPath>
city config alias
```

### 3.4 model

来源：

- 命令组入口：[`Model.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/Model.ts)
- 创建类命令：[`ModelCreateCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/ModelCreateCommand.ts)
- 读取类命令：[`ModelReadCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/ModelReadCommand.ts)
- 管理类命令：[`ModelManageCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/ModelManageCommand.ts)

子树：

```text
city model create
city model list
city model get
city model discover <providerId>
city model use <modelId>
city model add
city model pause <modelId>
city model remove
city model update
city model test
```

### 3.5 env

来源：

- [`Keys.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/Keys.ts)

子树：

```text
city env list [--scope global|agent|all] [--agent <agentId>] [--json]
city env set <key> <value> [--scope global|agent] [--agent <agentId>] [--description <text>] [--json]
city env delete <key> [--scope global|agent] [--agent <agentId>] [--json]
```

### 3.6 service

来源：

- 命令组入口：[`Services.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/Services.ts)
- schedule 子命令：[`ServiceScheduleCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/ServiceScheduleCommand.ts)
- 远程调用桥：[`ServiceCommandRemote.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/ServiceCommandRemote.ts)

子树：

```text
city service list
city service status <serviceName>
city service start <serviceName>
city service stop <serviceName>
city service restart <serviceName>
city service command <serviceName> <command>
city service schedule ...
```

说明：

- `city service list/status` 是 console 级静态 catalog 视图
- 不依赖 agent、`--path`、`--agent`
- `city service start/stop/restart/command` 是高级定向入口
- 日常运行态操作更推荐直接使用 `city chat` / `city task` / `city memory`

### 3.7 plugin

来源：

- 命令组入口：[`Plugins.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/Plugins.ts)

子树：

```text
city plugin list
city plugin status <pluginName>
city plugin action <pluginName> <actionName>
```

说明：

- `city plugin list/status` 是 console 级静态 catalog 视图
- 不依赖 agent、`--path`、`--agent`
- `city plugin action` 是高级入口，真正执行时依赖具体 agent 项目
- 日常 plugin 操作更推荐直接使用 `city web` / `city skill` / `city asr` / `city tts`

## 4. 动态注册命令树

### 4.1 service action 动态命令

注册入口：

- [`registerAllServicesForCli()`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/service/ServiceCommand.ts)
- service 清单：[`Services.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/service/Services.ts)

当前已注册 service class：

- `chat`
- `task`
- `memory`
- `shell`

说明：

- 只有声明了 `action.command` 的 action 才会暴露为 CLI 子命令
- 当前根帮助里可见的是 `chat`、`task`、`memory`
- `shell` 虽然是已注册 service，但当前没有暴露出可见根命令

当前可见子树：

```text
city chat ...
city task ...
city memory ...
```

#### chat

来源：

- 命令动态注册器：[`ServiceCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/service/ServiceCommand.ts)
- 实现：[`ChatService.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/services/chat/ChatService.ts)

当前可见二级命令：

```text
city chat status
city chat test
city chat reconnect
city chat open
city chat close
city chat configuration
city chat configure
city chat list
city chat info
city chat send
city chat react
city chat context
city chat delete
city chat history
```

#### task

来源：

- 命令动态注册器：[`ServiceCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/service/ServiceCommand.ts)
- 实现：[`TaskService.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/services/task/TaskService.ts)

当前可见二级命令：

```text
city task list
city task create
city task run
city task delete
city task update
city task status
city task enable
city task disable
```

#### memory

来源：

- 命令动态注册器：[`ServiceCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/service/ServiceCommand.ts)
- 实现：[`MemoryService.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/services/memory/MemoryService.ts)

当前可见二级命令：

```text
city memory status
city memory index
city memory search
city memory get
city memory store
city memory flush
```

### 4.2 plugin action 动态命令

注册入口：

- [`registerAllPluginsForCli()`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/plugin/PluginCommand.ts)
- plugin 清单：[`Plugins.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/plugin/Plugins.ts)

当前内建 plugin：

- `auth`
- `skill`
- `web`
- `asr`
- `tts`

说明：

- 只有声明了 `action.command` 的 plugin action 才会暴露为 CLI 子命令
- 当前根帮助里可见的是 `token`、`skill`、`web`、`asr`、`tts`
- `auth` 仍然是内建 plugin，但用户可见的 token 管理入口已经改成 `city token`

#### token

来源：

- 命令实现：[`Token.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/Token.ts)

当前可见二级命令：

```text
city token
city token list
city token create [name]
city token delete [tokenId]
```

#### skill

来源：

- 命令动态注册器：[`PluginCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/plugin/PluginCommand.ts)
- 实现：[`plugins/skill/Plugin.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/plugins/skill/Plugin.ts)

当前可见二级命令：

```text
city skill find
city skill install
city skill list
city skill lookup
```

#### web

来源：

- 命令动态注册器：[`PluginCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/plugin/PluginCommand.ts)
- 实现：[`plugins/web/Plugin.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/plugins/web/Plugin.ts)

当前可见二级命令：

```text
city web status
city web providers
city web install
city web on
city web off
city web use <provider>
city web doctor
```

#### asr

来源：

- 命令动态注册器：[`PluginCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/plugin/PluginCommand.ts)
- 实现：[`plugins/asr/Plugin.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/plugins/asr/Plugin.ts)

当前可见二级命令：

```text
city asr status
city asr install [models...]
city asr on [models...]
city asr off
city asr use <modelId>
city asr transcribe <audioPath>
city asr models
city asr doctor
```

#### tts

来源：

- 命令动态注册器：[`PluginCommand.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/plugin/PluginCommand.ts)
- 实现：[`plugins/tts/Plugin.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/plugins/tts/Plugin.ts)

当前可见二级命令：

```text
city tts status
city tts doctor
city tts models
city tts install [models...]
city tts on [models...]
city tts off
city tts use <modelId>
city tts synthesize <text>
```

## 5. 当前结构结论

当前 CLI 不是单一来源，而是三层叠加：

1. 固定根命令
   - 由 [`Index.ts`](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/modules/cli/Index.ts) 和 `src/main/modules/cli/*` 显式注册

2. 固定模块命令
   - `agent / config / model / service / plugin / env / console`

3. 动态 action 命令
   - 来自 `service` / `plugin` 的注册表
   - 当前可见：`chat / task / memory / skill / web / asr / tts`

这也是当前命令树看起来“比较散”的根本原因：一部分命令来自固定装配，一部分来自运行时注册表。
