# Downcity AUTH 文档集合

这组文档只回答一件事：

1. Downcity 里 `auth token` 到底代表什么
2. 它在 Console UI / CLI / Agent Server / shell / session 之间怎么流动
3. 当前已经实现了什么
4. 各个使用场景应该怎么用

建议阅读顺序：

1. [AUTH 总览与原则](./01-overview-and-principles.md)
2. [Token 生命周期与存储](./02-token-lifecycle-and-storage.md)
3. [请求链路与注入规则](./03-request-paths-and-injection.md)
4. [场景手册](./04-scenarios-and-usage.md)
5. [代码地图](./05-code-map.md)

如果你只想快速抓住当前模型，先记住一句话：

- `auth token` 代表“谁在调用”
- `sessionId` / `chatKey` 代表“在哪个上下文里执行”

也就是说：

- 不应该为每个 chat / session 单独签发一个长期 `auth token`
- 应该复用一份身份 token，再叠加 session 上下文

当前实现与本文档对齐到仓库真实代码状态，包含最近补上的 CLI Bearer Token 自动复用链。
