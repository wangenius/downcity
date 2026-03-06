# Main 架构方案（微内核 + 模块化 + 解耦）

## 1. 设计目标（简单优先）

1. `Agent` 只做一件事：`run`（执行 tool-loop 与返回结果）。
2. 可变能力全部模块化：不同功能放到不同 `modules` 槽位。
3. 核心稳定，模块可替换：算法、存储、策略在外部注入，不侵入核心。
4. 依赖单向流动：`core -> modules interface -> module impl`，避免反向耦合。

---

## 2. 总体分层

```text
services / api / cli
        |
        v
  ContextManager (微内核编排层)
        |
        v
      Agent (微内核执行层，只有 run)
        |
        v
     modules（可插拔）
      - history
      - compactor
      - systems
      - tools
      - hooks
```

说明：
- `Agent` 是执行内核，不直接感知“文件存储/压缩算法/记忆实现”。
- `ContextManager` 负责按 `contextId` 组装内核与模块，不承载业务策略。

---

## 3. 微内核职责

### 3.1 Agent（执行内核）

只负责：
1. 读取已准备好的 messages + system + tools。
2. 执行模型调用与 tool-loop。
3. 处理重试与错误交接。
4. 输出 assistant message。

不负责：
1. 历史存储细节。
2. compact 算法细节。
3. memory 提取细节。

### 3.2 ContextManager（编排内核）

只负责：
1. `contextId -> Agent` 生命周期缓存。
2. `contextId -> modules` 组装与缓存。
3. 触发模块钩子（如 context 更新后的异步维护）。

不负责：
1. 模块内部策略实现。
2. 业务服务逻辑（chat/task/skills）。

---

## 4. 模块设计（modules）

## 4.1 命名约定

1. 功能位统一叫 `modules`（简单直观）。
2. 纯算法实现用 `strategy`。
3. 外部依赖实现（文件/DB/缓存）用 `driver`。

示例：

```text
modules.history.driver = jsonl-file | sqlite | redis
modules.compactor.strategy = llm-summary | sliding-window
```

## 4.2 当前推荐模块槽位

1. `history`
   - 职责：消息读写、范围读取、元信息读取。
   - 可替换点：JSONL / SQLite / Redis。
2. `compactor`
   - 职责：上下文压缩（是否压缩、如何摘要、是否归档）。
   - 可替换点：LLM 摘要 / 窗口裁剪 / 混合策略。
3. `systems`
   - 职责：组装 system prompts（静态 + service + memory）。
4. `tools`
   - 职责：提供 Agent 本轮工具集合。
5. `hooks`
   - 职责：context 更新后的异步 side-effects（如 memory maintenance）。

---

## 5. 关键解耦原则

1. 核心只依赖接口，不依赖实现。
2. 模块之间禁止直接互调，通过内核或显式端口协作。
3. 一个模块只做一类事，避免“持久化 + 压缩 + 组装”混在同一实现里。
4. 默认实现必须可用，替换实现必须可插拔。

---

## 6. 运行时装配（RuntimeState）

启动时一次性装配：
1. 创建模型与日志器。
2. 创建 `ContextManager`。
3. 为 `ContextManager` 注入默认 `modules`（history/compactor/systems/tools/hooks）。
4. services 只从 `ServiceRuntime.context` 访问能力，不直接依赖具体实现类。

---

## 7. 最小落地方案（建议顺序）

1. 第一步：保持 `Agent.run` 不变，仅把 `compactor` 从 persistor 内部逻辑提为模块。
2. 第二步：把 `history` 读写能力从“具体类耦合”收敛为独立模块接口。
3. 第三步：把 context 更新后的行为改为 `hooks[]`，memory 只是其中一个 hook。

---

## 8. 一句话结论

最终架构是：
`Agent` 做稳定微内核执行，`modules` 承载所有可变能力；核心简化、模块可替换、边界清晰、演进成本低。
