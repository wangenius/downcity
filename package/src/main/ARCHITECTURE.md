# Main 架构设计（最终版）

## 1. 目标

1. 简单：调用链尽量短，核心流程只保留必要步骤。
2. 微内核：`Agent` 只负责执行，不承载策略细节。
3. 模块化：能力拆成清晰组件，默认实现可替换。
4. 解耦：`system / tools / compact / 持久化` 相互独立。
5. 直接迭代：不保留向后兼容层。

## 2. 总体分层

```text
commands / services / api
          |
          v
RuntimeState（进程级装配）
          |
          v
ContextManager（会话管理与调用收口）
          |
          v
Agent（微内核，只负责 run）
          |
          v
Persistor / Compactor / Orchestrator / Systemer
```

说明：
1. `RuntimeState` 负责把运行时依赖装起来。
2. `ContextManager` 负责按 `contextId` 管理会话实例。
3. `Agent` 不直接实现策略，只串联组件。
4. 默认组件放在 `runtime/context/components/` 与 `prompts/system/`。

## 3. Agent 组件模型

### 3.1 AgentComponent

`AgentComponent` 是执行组件抽象基类，用来统一组件命名与日志注入。

目标：
1. 让每个组件都有稳定边界。
2. 让 `Agent` 只依赖抽象，不依赖具体实现。
3. 让运行时默认实现与业务自定义实现可以自由替换。

### 3.2 PersistorComponent

职责：
1. 读取当前上下文历史。
2. 追加用户消息与助手消息。
3. 提供压缩前后所需的持久化支撑。

接口语义：

```ts
prepare(input: {
  contextId: string;
}): Promise<{
  history: ShipContextMessage[];
  historyMeta: ContextMessagesMeta;
}>

appendUser(input: {
  contextId: string;
  requestId: string;
  message: ShipContextUserMessageV1;
}): Promise<void>

appendAssistant(input: {
  contextId: string;
  requestId: string;
  message: ShipContextAssistantMessageV1;
}): Promise<void>
```

### 3.3 CompactorComponent

职责：
1. 判断历史是否需要压缩。
2. 执行压缩算法。
3. 在需要时回写压缩结果。

接口语义：

```ts
run(input: {
  contextId: string;
  model: LanguageModel;
  system: SystemModelMessage[];
  history: ShipContextMessage[];
  historyMeta: ContextMessagesMeta;
  retryCount: number;
}): Promise<{
  compacted: boolean;
  reason?: string;
}>
```

### 3.4 OrchestratorComponent

职责：
1. 生成 `requestId`。
2. 收敛本轮工具集合。
3. 收敛 step 级回调与运行时附加控制。

接口语义：

```ts
compose(input: {
  contextId: string;
}): Promise<{
  requestId: string;
  tools: Record<string, Tool>;
  onStepCallback?: () => Promise<ShipContextUserMessageV1[]>;
}>
```

### 3.5 SystemerComponent

职责：
1. 解析本轮 system 输入。
2. 组装最终 `SystemModelMessage[]`。
3. 把 system 资产、变量、service 信息收敛成统一输出。

接口语义：

```ts
resolve(input: {
  requestId: string;
}): Promise<SystemModelMessage[]>
```

说明：当前设计里 `Systemer` 不依赖 `contextId`，task agent 可独立创建。

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

1. `orchestrator.compose()`
2. `systemer.resolve({ requestId })`
3. `persistor.prepare({ contextId })`
4. `compactor.run(...)`，按需压缩，失败按 best-effort 处理
5. `persistor.appendUser(...)`
6. 执行 tool-loop 与模型生成
7. `persistor.appendAssistant(...)`
8. 返回 `AgentResult`

说明：
1. `Agent` 不再解析 system，不再管理存储细节。
2. `Agent` 不直接管理组件实现，只消费组件接口。
3. 调用链固定后，运行时代码更短，替换点更清晰。

## 5. ContextManager 职责

1. 管理 `contextId -> Agent` 缓存。
2. 管理会话级 `Persistor` 实例。
3. 注入全局 `Compactor / Orchestrator / Systemer`。
4. 提供统一入口：
   - `run(...)`
   - `appendUserMessage(...)`
   - `appendAssistantMessage(...)`
   - `afterContextUpdatedAsync(...)`

## 6. 默认实现

1. `runtime/context/components/FilePersistor.ts`：JSONL 历史持久化。
2. `runtime/context/components/SummaryCompactor.ts`：摘要压缩组件。
3. `runtime/context/components/compact/SummaryCompact.ts`：摘要压缩算法实现。
4. `runtime/context/components/RuntimeOrchestrator.ts`：`requestId / tools / onStep` 编排。
5. `prompts/system/PromptSystemer.ts`：system 组件适配层。
6. `prompts/system/SystemDomain.ts`：system 资产加载、变量替换、service 信息收敛、message 组装。
7. `prompts/variables/VariableReplacer.ts`：模板变量构建与替换。
8. `prompts/variables/PromptTypes.ts`：prompt 变量类型定义。
9. `prompts/variables/GeoContext.ts`：地理上下文解析。
10. `prompts/common/PromptRenderer.ts`：文本 prompt 转 system message。
11. `prompts/PromptRuntime.ts`：静态 prompt 资源运行时加载。
12. `utils/storage/index.ts`：跨目录复用的轻量存储辅助。

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
    state/
      RuntimeState.ts
      ProjectRuntimeSetup.ts
    context/
      ContextManager.ts
      RequestContext.ts
      ContextId.ts
      components/
        FilePersistor.ts
        SummaryCompactor.ts
        RuntimeOrchestrator.ts
        compact/
          SummaryCompact.ts
    env/
      Config.ts
      Paths.ts
    transport/
      daemon/
        Api.ts
        CliArgs.ts
        Client.ts
        Manager.ts
      server/
        server/index.ts
  prompts/
    PromptRuntime.ts
    System.ts
    system/
      PromptSystemer.ts
      SystemDomain.ts
      assets/
        core.prompt.txt
        service.prompt.txt
        task.prompt.txt
    common/
      InitPrompts.ts
      PromptRenderer.ts
      assets/
        init/
          PROFILE.md.txt
          SOUL.md.txt
          USER.md.txt
    variables/
      GeoContext.ts
      PromptTypes.ts
      VariableReplacer.ts
  model/
    CreateModel.ts
    ModelCommand.ts
    ModelManager.ts

utils/
  storage/
    index.ts
```

## 8. 设计约束

1. `Agent` 只依赖组件抽象，不依赖默认实现。
2. `Persistor / Compactor / Orchestrator / Systemer` 单责清晰。
3. `runtime/` 按功能域拆分：`state / context / env / transport`。
4. `prompt` 运行时能力统一放在 `prompts/`，不回流到 `runtime/`。
5. `Storage` 作为通用工具下沉到 `utils/`。
6. 不使用动态导入。
7. 新增共享类型统一放到 `types/`。
8. 命令层模型入口统一走 `model/ModelCommand`。
