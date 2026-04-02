# 场景手册

## 1. 首次启动系统

场景：

1. 本地第一次运行 `city start`
2. 还没有任何统一账户用户

当前行为：

1. `ensureConsoleAuthBootstrap()` 会创建默认管理员
2. 同时签发一枚 bootstrap token
3. token 会写入 CLI 本地认证状态

结果：

1. Console UI 可以后续登录
2. CLI 后续调用 agent API 时也能自动复用这枚 token

## 2. Console UI 正常使用

场景：

1. 用户打开 Console UI
2. UI 已经有登录态

当前用法：

1. UI 从 localStorage 读取 token
2. 后续请求自动带 `Authorization`

不需要：

1. 关心 `sessionId`
2. 手动复制 token

## 3. 本地终端执行 `city task ...`

场景：

1. 用户在仓库终端里执行 `city task run daily-check`

当前用法：

1. 默认不用传 token
2. CLI 会先读本地登录态
3. 如果找不到，再看 `DC_AUTH_TOKEN`
4. 再看是否显式传了 `--token`

推荐：

1. 本地开发尽量走默认本地登录态
2. 只在特殊场景再用 `--token`

## 4. agent shell 内执行 `city task ...`

场景：

1. agent 通过 shell tool 调 `city task` 或 `city chat`

当前正确理解：

1. 仍然是在“当前用户身份”下调用 agent API
2. 但认证凭证由 runtime 自动提供，不需要用户手动设置
3. 不是创建新的 session 认证主体

当前来源：

1. runtime 自动注入的内部 `DC_AUTH_TOKEN`
2. 如需覆盖，仍可用 `--token`

如果当前环境里这条内部链没有生效，才会出现：

1. 连不上 server
2. 或 `Missing bearer token`

## 5. CI / 自动化脚本

场景：

1. 非交互环境里跑 `city service ...` / `city task ...`

推荐方式：

1. 显式注入 `DC_AUTH_TOKEN`

原因：

1. 不依赖本机本地登录态
2. 容易在 CI 配置中管理
3. 不需要把 token 写死到命令文本里

## 6. 临时切换身份

场景：

1. 你想临时用另一枚 token 调同一个命令

推荐方式：

1. 显式传 `--token`

因为当前优先级是：

1. `--token`
2. `DC_AUTH_TOKEN`
3. 本地登录态

## 7. 为什么不需要“每个 session 一个 token”

假设当前 session 是 `telegram-chat-123`。

你真正需要的是：

1. Bearer Token：说明“谁在调”
2. `sessionId=telegram-chat-123`：说明“把结果挂到哪个上下文里”

这两者合起来已经足够表达完整语义。

所以不要设计成：

1. 先为 `telegram-chat-123` 再额外签发一枚 auth token

那会把“身份”和“上下文”重复编码两遍。

## 8. 故障排查顺序

当你看到 auth 相关问题时，按下面顺序排查：

1. agent server 是否已启动
2. 系统是否已经 bootstrap 进入统一鉴权模式
3. 当前命令是否能拿到 token
4. token 是否被吊销或过期
5. 当前 token 是否有对应 permission

最常见的两类报错：

1. 连接失败：server 根本没起来
2. `Missing bearer token`：server 已起来，但当前请求没带 token
