# Main 架构设计（最终版）

## 1. 目标

1. 简单：调用链尽量短，核心流程只保留必要步骤。
2. 微内核：`Agent` 只负责执行，不承担具体策略实现。
3. 模块化：能力按组件拆分，接口稳定，默认实现可替换。
4. 解耦：`system / tools / compact / 持久化` 各自独立。
5. 直接迭代：不保留向后兼容层。

## 2. 分层

```text
services / api / cli
        |
        v
ContextManager（会话管理与调用收口）
        |
        v
Agent（微内核，只负责 run）
        |
        v
Persistor + Compactor + Orchestrator + Systemer
        |
        v
runtime/components/*（默认实现）
```

## 3. 核心概念

### 3.1 AgentComponent（统一基类）

```ts
abstract class AgentComponent {
  abstract readonly name: string;
  async init(): Promise<void> {}
  async dispose(): Promise<void> {}
}
```

作用：仅提供最小生命周期能力，不承载业务方法。

### 3.2 PersistorComponent（历史持久化）

职责：
1. 历史读写：`append/list/slice/size/meta`。
2. 运行准备：`prepare(...)` 组装 `ModelMessage[]`。
3. 压缩执行：`compact(...)`（由 Compactor 驱动参数）。
4. 消息工厂：`userText(...)`、`assistantText(...)`。

### 3.3 CompactorComponent（上下文压缩策略）

职责：
1. 决策压缩参数（如窗口、预算、归档策略）。
2. 调用 `persistor.compact(...)` 执行压缩。
3. 失败 fail-open，不阻断主执行链路。

接口：

```ts
run(input: {
  persistor: PersistorComponent;
  model: LanguageModel;
  system: SystemModelMessage[];
  retryCount: number;
}): Promise<{ compacted: boolean; reason?: string }>
```

### 3.4 OrchestratorComponent（运行编排）

职责：
1. 生成 `requestId`。
2. 提供本轮 `tools`。
3. 读取并注入 `onStepCallback`。

接口：

```ts
compose(input: {
  contextId: string;
}): Promise<{
  requestId: string;
  tools: Record<string, Tool>;
  onStepCallback?: () => Promise<ShipContextUserMessageV1[]>;
}>
```

说明：`Orchestrator` 不再负责 system 解析。

### 3.5 SystemerComponent（system 解析）

职责：
1. 接收本轮 `contextId/requestId`。
2. 调用 `SystemDomain` 统一完成显式档位(profile)解析与加载。
3. 生成最终 `SystemModelMessage[]`。

接口：

```ts
resolve(input: {
  contextId: string;
  requestId: string;
}): Promise<SystemModelMessage[]>
```

## 4. Agent 最终形态

```ts
class Agent {
  constructor(params: {
    model: LanguageModel;
    logger: Logger;
    persistor: PersistorComponent;
    compactor: CompactorComponent;
    orchestrator: OrchestratorComponent;
    systemer: SystemerComponent;
  }) {}

  run(input: {
    query: string;
  }): Promise<AgentResult> {}
}
```

### 4.1 run 固定调用链

1. `orchestrator.compose({ contextId })`
2. `systemer.resolve({ contextId, requestId })`
3. `compactor.run(...)`（best-effort）
4. `persistor.prepare(...)`
5. tool-loop 执行并返回 `assistantMessage`

## 5. ContextManager 职责

1. 管理 `contextId -> Agent` 缓存。
2. 管理 `contextId -> Persistor` 缓存。
3. 注入全局 `compactor / orchestrator / systemer`。
4. 提供统一入口：
   - `run(...)`
   - `appendUserMessage(...)`
   - `appendAssistantMessage(...)`
   - `afterContextUpdatedAsync(...)`

## 6. 默认实现

1. `FilePersistor`：JSONL 历史持久化。
2. `SummaryCompactor`：摘要压缩策略。
3. `RuntimeOrchestrator`：requestId/tools/onStep 编排。
4. `PromptSystemer`：组件适配层（位于 `prompts/system`）。
5. `SystemDomain`：system 全链路实现（资产加载 + 显式档位(profile)解析 + service 收集 + messages 组装，位于 `prompts/system`）。
6. `VariableReplacer`：模板变量构建与变量替换（位于 `prompts/variables`）。
7. `PromptTypes`：模板变量类型定义（位于 `prompts/variables`）。
8. `GeoContext`：模板渲染所需地理上下文解析（位于 `prompts/variables`）。
9. `PromptRenderer`：文本 prompt 到 system message 转换（位于 `prompts/common`）。

## 7. 目录约定

```text
main/
  agent/
    Agent.ts
    components/
      AgentComponent.ts
      PersistorComponent.ts
      CompactorComponent.ts
      OrchestratorComponent.ts
      SystemerComponent.ts
  runtime/
    ContextManager.ts
    components/
      FilePersistor.ts
      SummaryCompactor.ts
      RuntimeOrchestrator.ts
      compact/SummaryCompact.ts
  prompts/
    system/
      PromptSystemer.ts
      SystemDomain.ts
      assets/
        core.prompt.txt
        service.prompt.txt
        task.prompt.txt
    common/
      PromptRenderer.ts
      InitPrompts.ts
      assets/
        init/
          PROFILE.md.txt
          SOUL.md.txt
          USER.md.txt
    variables/
      VariableReplacer.ts
      PromptTypes.ts
      GeoContext.ts
```

## 8. 设计约束

1. `Agent` 只依赖组件抽象，不依赖具体实现。
2. `Persistor/Compactor/Orchestrator/Systemer` 各自单责。
3. 不使用动态导入。
4. 命令层禁止直接硬编码模型预设，统一走 `commands/ModelCommand`。
5. 模型预设与 provider 映射统一收敛在 `llm/ModelManager`。
6. 新增共享类型统一放在 `types/`。
