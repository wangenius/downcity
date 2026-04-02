# AUTH 总览与原则

## 1. 当前问题域

Downcity 里现在至少有三类“看起来像身份或上下文”的东西：

1. Bearer Token
2. `sessionId`
3. `chatKey`

如果这三者边界不清，就会出现两个典型问题：

1. agent 在 shell 里调用 `city task` 时，不知道该带谁的 token
2. 开发时容易误以为“每个 session 都要发一个 auth token”

本文档的结论是：

- Bearer Token 只负责身份
- `sessionId` / `chatKey` 只负责执行上下文

## 2. 一个最简心智模型

| 概念 | 回答的问题 | 是否应该长期保存 | 是否应该每个 session 一份 |
| --- | --- | --- | --- |
| Bearer Token | 谁在调用 | 是 | 否 |
| `sessionId` | 这次执行属于哪个会话 | 是 | 是 |
| `chatKey` | 这次执行映射到哪个外部 chat | 是 | 是 |
| `requestId` | 这一轮请求是谁 | 否 | 每次请求不同 |

所以正确分层是：

1. 身份层：Bearer Token
2. 执行层：`sessionId` / `chatKey` / `requestId`

而不是：

1. 每个 session 都重新变成一套认证主体

## 3. 当前 AUTH 模型

当前统一账户模型是：

1. Console 侧保存 `auth_users` / `auth_roles` / `auth_permissions` / `auth_tokens`
2. 服务端用 `Authorization: Bearer <token>` 识别当前 principal
3. 路由守卫按 principal 的 permissions 决定是否放行

它的核心特征是：

1. token 对应用户，不对应 session
2. token 可以复用
3. token 可以吊销
4. token 使用会留下审计与最后使用时间

## 4. 为什么不做“每个 session 一个 auth token”

如果每个 session 都单独发 token，会直接增加以下复杂度：

1. token 爆炸
2. 吊销策略复杂
3. 审计难读
4. 权限边界混乱
5. shell / task / chat 之间很难共享同一个调用身份

更糟的是：

- session 本来是执行单元
- token 本来是身份凭证

把它们绑定，就会把“执行上下文”和“安全主体”混成一层。

## 5. 当前仓库采用的原则

当前实现已经明确按下面的规则走：

1. 首次 bootstrap 后，系统进入 Bearer Token 鉴权模式
2. Console UI 使用本地登录态 Bearer Token
3. CLI 使用一份可复用的本地 Bearer Token
4. `sessionId` 继续只是 task/chat 的执行上下文
5. CLI 调 agent API 时，自动补 Bearer Token，不要求每个 session 再发 token

## 6. 对 agent shell 的正确理解

agent shell 里执行 `city task ...` 时，本质上仍然是在“当前身份”下调用 agent server。

所以 agent shell 需要的不是：

- 一个“新的 session token”

而是：

- 能拿到当前 Bearer Token
- 再叠加当前 shell 已注入的 `DC_SESSION_ID`

这也是为什么最近补的是 CLI token 自动注入链，而不是 session token 机制。
