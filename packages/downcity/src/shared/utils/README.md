# utils

## 模块定位

`utils/` 放置可被多模块复用的基础工具实现。  
当前主要包括日志、ConsoleStore、CLI 与时间等通用基础设施。

## 实现概览

1. `logger/Logger.ts`
   - 提供进程级单例 logger。
   - 支持控制台输出 + `.downcity/logs/YYYY-MM-DD.jsonl` 结构化落盘。
   - 通过 `bindProjectRoot` 绑定当前工程的日志目录。
2. `logger/Fetch.ts`
   - 封装 `fetch`，在请求发往 LLM 前写入日志。
   - 通过注入的 `getRequestContext` 回调读取并拼接 `sessionId/requestId`。
3. `logger/Format.ts`
   - 作为日志格式化 facade，对外保持稳定导出。
4. `logger/FormatShared.ts`
   - 负责 JSON/文本抽取、截断、消息块拼装等共享基础能力。
5. `logger/FormatRequest.ts`
   - 解析 provider request payload，提取 messages/system/tool 摘要与元信息。
6. `logger/FormatResponse.ts`
   - 解析 provider response / SSE payload，提取输出类型与 function call 摘要。
7. `store/index.ts`
   - 提供 `ConsoleStore` 门面。
   - 对外统一暴露 provider/model、secure settings、env、channel account 存储能力。
8. `store/StoreSchema.ts`
   - 负责 SQLite 建表与轻量迁移。
9. `store/StoreModelRepository.ts`
   - 负责 provider/model 相关读写。
10. `store/StoreSecureSettings.ts`
   - 负责加密配置读写。
11. `store/StoreEnvRepository.ts`
   - 负责 global/agent env 单表读写。
12. `store/StoreChannelAccountRepository.ts`
   - 负责渠道账号存储与敏感字段加解密。

## 关键调用链

1. `main/model/CreateModel.ts` 创建模型时注入 `createLlmLoggingFetch`。
2. `sessions/RequestContext.ts` 在运行期维护 `sessionId/requestId`。
3. LLM 请求发出时，`utils/logger` 通过注入回调读取上下文并记录结构化日志。
4. `main/modules/cli/Model*.ts`、`main/modules/console/*` 等控制面模块通过 `ConsoleStore` 访问 SQLite 配置数据。

## 边界约束

- `utils` 提供通用能力，不承载业务规则或流程编排。
- 与业务强耦合的辅助函数应优先放回所属模块。
