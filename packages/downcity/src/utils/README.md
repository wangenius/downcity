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
   - 解析 provider 请求 payload，提取可读的消息摘要与元信息。
   - 内置截断策略，避免日志输出失控。
4. `store/index.ts`
   - 提供 `ConsoleStore` 门面。
   - 对外统一暴露 provider/model、secure settings、env、channel account 存储能力。
5. `store/StoreSchema.ts`
   - 负责 SQLite 建表与轻量迁移。
6. `store/StoreModelRepository.ts`
   - 负责 provider/model 相关读写。
7. `store/StoreSecureSettings.ts`
   - 负责加密配置读写。
8. `store/StoreEnvRepository.ts`
   - 负责 global/agent env 单表读写。
9. `store/StoreChannelAccountRepository.ts`
   - 负责渠道账号存储与敏感字段加解密。

## 关键调用链

1. `main/model/CreateModel.ts` 创建模型时注入 `createLlmLoggingFetch`。
2. `sessions/RequestContext.ts` 在运行期维护 `sessionId/requestId`。
3. LLM 请求发出时，`utils/logger` 通过注入回调读取上下文并记录结构化日志。
4. `main/commands/Model*.ts`、`main/ui/*` 等控制面模块通过 `ConsoleStore` 访问 SQLite 配置数据。

## 边界约束

- `utils` 提供通用能力，不承载业务规则或流程编排。
- 与业务强耦合的辅助函数应优先放回所属模块。
