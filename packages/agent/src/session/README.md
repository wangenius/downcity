# Session Module

`session/` 是单 Agent 会话执行内核。它不直接面向普通 SDK 用户；普通用户通过 `sdk/Session.ts` 使用 `session.run()`、`session.stream()`、`session.history()` 等 API。

## 核心概念

- `Session`：用户/SDK 面向的完整会话对象，负责模型配置、历史入口、运行入口和分叉能力。
- `Executor`：单个 session 的一轮 run 执行引擎，负责并发锁、run scope、Composer 编排、压缩重试、assistant step 持久化和 tool-loop 调用。
- `Composer`：执行前的材料组装协议，只负责把原材料组装成某一阶段输入，不直接执行模型，也没有公共运行时基类。
- `HistoryStore`：历史事实源，负责 JSONL 读写、meta、archive、lock、compact 与消息工厂。
- `HistoryComposer`：历史组装策略，只负责把 `HistoryStore` 中的历史组装成本轮模型输入。
- `CoreEngine`：Executor 内部的模型/tool-loop 核心机制，负责模型流、tool calls、续写和最终 assistant message 合并。

## 一轮 run 的调用链

```text
sdk/Session.run({ query })
  -> append user message
  -> session/Executor.run({ query })
     -> ContextComposer.compose()
     -> SystemComposer.resolve()
     -> CompactionComposer.run()
     -> HistoryComposer.prepare()
     -> Executor.runCoreEngine()
        -> ai.streamText({ model, system, messages, tools })
     -> return assistantMessage
  -> append final assistant message
  -> return SDK result
```

## Composer 分工

- `composer/system/`：组装本轮 system messages，例如 instruction、service system、plugin system 和 session context。
- `composer/history/`：只组装本轮 model messages，不负责历史落盘。
- `composer/context/`：组装 tools、step hooks、fallback assistant message 等运行上下文。
- `composer/compaction/`：判断上下文错误和压缩历史，必要时写入 summary 与 archive。

## Composer 的代码实现方式

Composer 在代码里是 TypeScript `interface`，不是抽象基类。每个 Composer 只声明当前阶段需要的最小协议，实现类用 `implements` 接上。

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
- Composer 不持有历史事实，历史事实由 `HistoryStore` 负责。
- Composer 不管理 session 生命周期，生命周期由 `Session` / `Executor` 管理。
- Composer 可以读取上下文并做策略判断，但输出应该是“本轮执行材料”。

## 当前目录结构

```text
session/
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
