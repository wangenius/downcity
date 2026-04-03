# types

## 模块定位

`types/` 是跨层共享的基础类型目录，用于承载可在 `agent`、`services`、`console` 等层之间复用的通用类型。  
这里的类型应保持稳定、轻量、无业务副作用。

## 当前实现

目前目录内提供：

- `Json.ts`
  - 定义 `JsonPrimitive`、`JsonValue`、`JsonObject`。
  - 作为跨模块传输结构化数据时的统一约束（配置、日志 details、服务 payload 等）。
- `ExecutionContext.ts`
  - 定义 `ExecutionContext`、`StructuredConfig`。
  - `ExecutionContext` 是 service / runtime plugin 共用的最小执行上下文。
  - 用于承载路径、配置、环境与日志这些稳定底座能力。
- `Plugin.ts`
  - 定义 `Plugin`、`PluginAction`、`PluginPort` 等。
  - 用于统一表达 CLI plugin 命令、runtime 扩展行为、可用性与显式调用协议。
- `VoicePlugin.ts`
  - 定义 `VoicePluginConfig`、`VoiceTranscriberConfig`、`VoiceTranscriberHandle`。
  - 用于 asr plugin 的行为配置与转写依赖配置。
- `TtsPlugin.ts`
  - 定义 `TtsPluginConfig`、`TtsSynthesizeInput`、`TtsAudioFormat`。
  - 用于 tts plugin 的行为配置与语音合成输入定义。
- `WebPlugin.ts`
  - 定义 `WebPluginConfig`、`WebPluginInstallInput`、`WebPluginDependencyCheckResult`。
  - 用于 web plugin 的联网依赖配置、安装输入与检测结果。
- `PluginApi.ts`
  - 定义 `PluginListResponse`、`PluginAvailabilityResponse`、`PluginActionResponse`。
  - 用于 plugin CLI / HTTP 桥接层，统一描述管理面协议。
- `AuthDashboard.ts`
  - 定义 `AuthDashboardPayload`。
  - 用于 dashboard authorization 页面，统一描述 auth 管理面的返回结构。
- `types/auth/*`
  - 定义统一账户 V1 的用户、角色、权限、token、路由策略等基础类型。
  - 用于 `main/auth/*` 的 Bearer Token 认证链路，避免把 auth 协议散落到路由与存储层。

## 设计原则

1. 只放“跨模块通用类型”，避免夹带特定业务语义。
2. 保持可序列化约束，优先使用 `JsonValue` 族类型替代 `any`。
3. 当某类型只服务于单一模块时，应放回对应模块的 `types/` 子目录。

## 后续扩展建议

- 新增全局类型时，优先评估是否真的跨层复用。
- 若只是 `main` 或 `services` 内部协议，不建议放到这里。
