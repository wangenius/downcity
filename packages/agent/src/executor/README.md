# Executor Module

`executor/` 是单 Agent 的内部执行内核。它不直接面向普通 SDK 用户；普通用户通过 `sdk/Session.ts` 使用 `session.prompt()`、`session.subscribe()`、`session.history()` 等 API。

## 核心概念

- `Session`：用户/SDK 面向的完整会话对象，负责模型配置、历史入口、prompt 入口和分叉能力。
- `Executor`：单个 session 的内部单轮执行引擎，负责并发锁、执行 scope、Composer 编排、压缩重试、assistant step 持久化和 tool-loop 调用。
- `Composer`：Session 执行阶段的可替换策略协议。调用方可以通过 custom composer 定义 system、history、runtime context 与 compaction 等阶段逻辑。
- `HistoryStore`：历史事实源，负责 JSONL 读写、meta、archive、lock、compact 与消息工厂。
- `HistoryComposer`：历史组装策略，只负责把 `HistoryStore` 中的历史组装成本轮模型输入。
- `CoreEngine`：Executor 内部的模型/tool-loop 核心机制，负责模型流、tool calls、续写和最终 assistant message 合并。

## 一轮 prompt 的调用链

```text
sdk/Session.prompt({ query })
  -> SessionPromptRuntime 绑定 turn
  -> append user message
  -> executor/Executor 执行当前 turn
     -> ContextComposer.compose()
     -> SystemComposer.resolve()
     -> CompactionComposer.run()
     -> HistoryComposer.prepare()
     -> Executor.runCoreEngine()
        -> ai.streamText({ model, system, messages, tools })
     -> return assistantMessage
  -> append final assistant message
  -> resolve turn.finished
```

## Composer 分工

- `composer/system/`：组装本轮 system messages，例如 instruction、plugin system 和 session context。
- `composer/history/`：只组装本轮 model messages，不负责历史落盘。
- `composer/context/`：组装 tools、step hooks、fallback assistant message 等运行上下文。
- `composer/compaction/`：判断上下文错误和压缩历史，必要时写入 summary 与 archive。

## Composer 的代码实现方式

Composer 在代码里是 TypeScript `interface`，不是抽象基类。每个 Composer 声明当前阶段的策略协议，实现类用 `implements` 接上；如果需要自定义 Composer，应在自定义 `Session` 类中传给 `super({ composers })`。

```ts
export interface SessionSystemComposer {
  readonly name: string;
  resolve(): Promise<SystemModelMessage[]>;
}

export class DefaultSessionSystemComposer implements SessionSystemComposer {
  readonly name = "prompt_system";

  async resolve() {
    // 关键点（中文）：只组装 system messages，不执行模型、不写历史。
  }
}
```

当前四类协议分别回答四个问题：

- `SessionSystemComposer.resolve()`：这一轮 system messages 是什么？
- `SessionHistoryComposer.prepare()`：这一轮喂给模型的 history messages 是什么？
- `SessionContextComposer.compose()`：这一轮有哪些 tools 与 step hooks？
- `SessionCompactionComposer.run()`：是否需要压缩，以及压缩策略是什么？

`Executor.prepareExecuteInput()` 是 Composer 的唯一主装配点：

```text
Executor.prepareExecuteInput()
  -> ContextComposer.compose()
  -> SystemComposer.resolve()
  -> CompactionComposer.run(historyStore)
  -> HistoryComposer.prepare()
  -> SessionExecuteInput
```

边界规则：

- Composer 不调用模型，模型调用只发生在 `Executor.runCoreEngine()`。
- Composer 可以绑定或读取当前 session 的上下文，但历史事实源仍由 `HistoryStore` 负责。
- Composer 不管理 session 生命周期，生命周期由 `Session` / `Executor` 管理。
- Composer 可以读取上下文并做策略判断，输出或执行结果应该服务于当前阶段的本轮 session 执行。

## 当前目录结构

```text
executor/
├── Executor.ts
├── SessionRunScope.ts
├── composer/
│   ├── compaction/
│   ├── context/
│   ├── history/
│   └── system/
├── core-engine/
│   ├── CoreEngineMessageState.ts
│   ├── CoreEngineLoopDecision.ts
│   ├── CoreEngineSignals.ts
│   ├── CoreEngineError.ts
│   └── CoreEngineUiStreamCollector.ts
├── store/
│   └── history/
│       ├── SessionHistoryStore.ts
│       └── jsonl/JsonlSessionHistoryStore.ts
├── ids/
├── messages/
├── tools/
└── types/
```
