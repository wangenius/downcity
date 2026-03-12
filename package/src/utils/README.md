# utils

## 模块定位

`utils/` 放置可被多模块复用的基础工具实现。  
当前主要是日志基础设施，为运行时与 LLM 调用提供统一可观测能力。

## 实现概览

1. `logger/Logger.ts`
   - 提供进程级单例 logger。
   - 支持控制台输出 + `.ship/logs/YYYY-MM-DD.jsonl` 结构化落盘。
   - 通过 `bindProjectRoot` 绑定当前工程的日志目录。
2. `logger/Fetch.ts`
   - 封装 `fetch`，在请求发往 LLM 前写入日志。
   - 通过注入的 `getRequestContext` 回调读取并拼接 `contextId/requestId`。
3. `logger/Format.ts`
   - 解析 provider 请求 payload，提取可读的消息摘要与元信息。
   - 内置截断策略，避免日志输出失控。

## 关键调用链

1. `console/model/CreateModel.ts` 创建模型时注入 `createLlmLoggingFetch`。
2. `agent/context/manager/RequestContext.ts` 在运行期维护 `contextId/requestId`。
3. LLM 请求发出时，`utils/logger` 通过注入回调读取上下文并记录结构化日志。

## 边界约束

- `utils` 提供通用能力，不承载业务规则或流程编排。
- 与业务强耦合的辅助函数应优先放回所属模块。
