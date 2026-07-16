# Executor Module

`executor/` 是 Session 内部的模型与 Tool Loop 执行内核。普通 SDK 用户只通过 `Session` 调用它。

## 边界

- `SessionTurn` 拥有输入队列、Turn Handle、取消信号与 Message 收口。
- `SessionComposer` 根据只读 Session 快照组装 system、history 和 tools。
- `Executor` 管理单次模型执行、上下文超限重试和 Step Plugin lease。
- `CoreEngineRunner` 执行 `streamText()`、Tool Loop、续写与内存上下文折叠。
- `SessionMessages` 是 Message 唯一事实源；Executor 不写文件、不持有 Store。

## 调用链

```text
Session.prompt()
  -> SessionTurn 写入 User Message
  -> SessionComposer.compose(readonly snapshot)
  -> Executor.run()
  -> CoreEngineRunner.run()
  -> SessionTurn 接收 stream chunk
  -> SessionMessages 完成 Assistant Message
```

每个模型 Step 前，`SessionTurn` 消费排队的 steer 和状态命令，Composer 再基于最新 effective state 生成完整 Step 输入。

## Compaction

```text
SessionComposer.compact(snapshot)
  -> SessionCompactionPlan
  -> SessionMessages.compact_active(plan)
```

Composer 可以调用模型生成 Summary，但不能修改 Message、Metadata 或发布事件。持久化提交始终由 Session 完成。

## 目录

```text
executor/
  Executor.ts
  core-engine/       模型与 Tool Loop
  composer/system/   默认 system prompt 领域实现
  messages/          AI SDK 消息转换
  services/          执行恢复策略
  tools/             Tool 运行辅助
  types/             Executor 内部类型
```
