# 请求链路与注入规则

## 1. 总链路

当前 Bearer Token 的传递链大致分成三条：

1. Console UI -> Gateway / Agent API
2. CLI -> Agent API
3. 外部调用方 -> Agent API

## 2. Console UI 链路

Console UI 的链路已经很完整：

1. 登录成功
2. token 写到 localStorage
3. `requestConsoleApiJson()` 统一给请求加 `Authorization`
4. server / gateway 通过 `RoutePolicy` 做鉴权

关键文件：

1. `products/console-ui/src/lib/dashboard-api.ts`
2. `packages/downcity/src/main/auth/RoutePolicy.ts`
3. `packages/downcity/src/main/auth/AuthService.ts`

## 3. CLI 链路

CLI 现在的链路是：

1. 各个命令收集 `--token` / `--host` / `--port`
2. 命令最终都调用 `callServer()`
3. `callServer()` 自动解析 Bearer Token
4. 自动附加 `Authorization` 请求头

关键文件：

1. `packages/downcity/src/main/daemon/Client.ts`
2. `packages/downcity/src/main/auth/CliAuthStateStore.ts`
3. `packages/downcity/src/main/service/ServiceCommand.ts`
4. `packages/downcity/src/main/plugin/PluginCommand.ts`
5. `packages/downcity/src/main/commands/ServiceCommandRemote.ts`
6. `packages/downcity/src/main/commands/Plugins.ts`

## 4. 现在哪些命令会自动带 token

当前只要最终走 `callServer()` 调 agent API，就会自动带 token。

包括：

1. `city service ...`
2. `city plugin ...`
3. `city task ...`
4. `city chat ...`
5. `city memory ...`
6. `city skill ...`
7. `city asr ...`
8. `city tts ...`

注意：

1. 这些命令是否能成功，还取决于 agent server 是否可访问
2. 没有启动 agent server 时，仍然会先报连接失败
3. 启动且已 bootstrap 后，如果没 token，才会进入 `Missing bearer token`

## 5. 路由守卫行为

当前 `RoutePolicy` 的逻辑是：

1. 若当前系统还没有任何 auth user，受保护接口默认放行
2. 一旦完成 bootstrap，受保护接口开始要求 Bearer Token
3. 某些接口还会继续检查 permissions

这解释了两个常见现象：

1. 刚启动时 API 可能不要求 token
2. bootstrap 之后同一路由 suddenly 变成受保护

## 6. 为什么 agent shell 会遇到认证问题

agent shell 里执行 `city task run ...` 时，本质上还是 CLI -> agent API。

所以认证成功需要满足：

1. agent server 可访问
2. 当前命令能解析到 Bearer Token

当前 token 解析来源：

1. `--token`
2. `DC_AUTH_TOKEN`
3. 本地 CLI 登录态

现在 agent runtime 已经会自动补这一层：

1. server 进程内持有 `DC_INTERNAL_AUTH_TOKEN`
2. shell 子进程自动继承为 `DC_AUTH_TOKEN`
3. shell 里的 `city ...` 直接沿用现有 CLI token 解析链

所以 agent shell 不需要“一个新的 session token”，只需要 runtime 自动提供内部 token。

## 7. 当前尚未自动做的事

当前仍然没有做的是：

1. runtime internal token 的轮换
2. runtime internal token 的显式过期策略
3. 把内部 token 限缩成更细粒度 permissions
