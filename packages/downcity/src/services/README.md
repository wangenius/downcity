# services

## 模块定位

`services/` 是业务能力层，承载可注册的服务模块（chat/task/memory/shell 等）以及对应 runtime 能力。  
每个服务通过 `ServiceEntry` 实现 `Service` 契约，并用 `actions` 对象声明可用能力。

## 实现概览

1. `chat/`
   - 提供 `chat send/context` 能力与 `/service/chat/*` 接口。
   - 维护平台适配器（Telegram/Feishu/QQ）与发送分发逻辑。
   - `runtime/` 包含队列、幂等、发送注册表、文本标准化等执行细节。
2. `task/`
   - 管理任务定义（`task.md` frontmatter + body）与执行入口。
   - 支持任务 CRUD、状态切换、立即执行、cron 调度运行时。
3. `memory/`
   - 负责上下文记忆提取、压缩与备份策略。
   - 由 `agent/context/manager/ContextManager` 在上下文更新后异步触发，不阻塞主对话链路。

## 关键文件

- `chat/ServiceEntry.ts`
- `chat/Service.ts`
- `task/ServiceEntry.ts`
- `task/Service.ts`
- `memory/runtime/Service.ts`

## 统一服务模式

1. `ServiceEntry.ts` 声明 `actions`（command/api/execute）。
2. `ServiceEntry.ts` 可选声明 `system` 字段（`system(context) => string`）。
3. `Service.ts` 承载参数归一化、校验与业务流程。
4. `runtime/` 承载状态管理、调度与工具函数。
5. `types/` 定义服务输入输出协议，供 CLI 与 HTTP 共用。

## 边界约束

- `services` 应通过 `console/service/ServiceRuntime` 端口获取运行时能力。
- 服务间协作优先通过运行时依赖端口（`ServiceRuntime`）而非隐式全局状态。
