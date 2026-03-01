# core

## 模块定位

`core/` 是运行时内核层，负责 Agent 执行、上下文管理、Prompt 组装、工具协议与模型调用抽象。  
这一层追求“可复用 + 可组合”，不承载 chat/skill/task 等具体业务语义。

## 实现概览

1. `context/`
   - `ContextManager` 维护 `contextId -> Agent/ContextStore` 的生命周期缓存。
   - `ContextStore` 负责消息与元数据落盘（含 compact/archive）。
   - `AgentRunner` 负责 system prompt 组装、tool loop 调用、重试与结果回写。
2. `prompts/`
   - `SystemProvider` 提供可扩展的 provider 注册与聚合机制。
   - 按 `order` 稳定排序执行，provider 单点失败采用 fail-open。
3. `shell/`
   - 暴露 `exec_command`、`write_stdin`、`close_shell` 三个会话式工具。
   - 通过 `ShellContextManager` 管理多会话状态，输出分页与 token 限制由 `ShellHelpers` 统一处理。
4. `llm/`
   - `CreateModel` 统一构建 Anthropic/OpenAI/OpenAI Compatible 模型实例。
   - 内置 API Key 解析（含 `${ENV}`）与 LLM 请求日志接入。
5. `types/`
   - 承载 core 内核抽象（Agent、ContextMessage、SystemPromptProvider、Shell 输入输出类型等）。

## 关键文件

- `context/AgentRunner.ts`
- `context/ContextManager.ts`
- `prompts/SystemProvider.ts`
- `shell/Tool.ts`
- `llm/CreateModel.ts`

## 典型调用链

1. 上层（`main` 或 `services`）写入用户消息到 `ContextStore`。
2. `ContextManager` 获取/创建 `ContextAgentRunner`。
3. `AgentRunner` 聚合系统提示、过滤可用工具并执行 tool loop。
4. 结果写回上下文消息流，随后触发 memory 维护回调（由 services 注入实现）。

## 边界约束

- `core` 不直接实现具体业务服务能力（例如平台适配、技能发现、任务定义）。
- `core` 提供稳定抽象，上层通过注入/注册扩展行为。
