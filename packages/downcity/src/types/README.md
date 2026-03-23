# types

## 模块定位

`types/` 是跨层共享的基础类型目录，用于承载可在 `agent`、`services`、`console` 等层之间复用的通用类型。  
这里的类型应保持稳定、轻量、无业务副作用。

## 当前实现

目前目录内提供：

- `Json.ts`
  - 定义 `JsonPrimitive`、`JsonValue`、`JsonObject`。
  - 作为跨模块传输结构化数据时的统一约束（配置、日志 details、服务 payload 等）。
- `Asset.ts`
  - 定义 `Asset`、`AssetPort`、`AssetCheckResult`、`AssetInstallResult`。
  - 用于新的插件资产体系，统一表达底层资源对象与其调用协议。
- `Plugin.ts`
  - 定义 `Plugin`、`PluginAction`、`PluginPort` 等。
  - 用于新的声明式插件体系，统一表达插件行为、可用性与显式调用协议。
- `VoicePlugin.ts`
  - 定义 `VoicePluginConfig`、`VoiceTranscriberAssetConfig`、`VoiceTranscriberHandle`。
  - 用于 voice 插件第一阶段迁移，拆分插件行为配置与底层转写资产配置。
- `PluginApi.ts`
  - 定义 `PluginListResponse`、`PluginAvailabilityResponse`、`PluginActionResponse`。
  - 用于 plugin CLI / HTTP 桥接层，统一描述管理面协议。

## 设计原则

1. 只放“跨模块通用类型”，避免夹带特定业务语义。
2. 保持可序列化约束，优先使用 `JsonValue` 族类型替代 `any`。
3. 当某类型只服务于单一模块时，应放回对应模块的 `types/` 子目录。

## 后续扩展建议

- 新增全局类型时，优先评估是否真的跨层复用。
- 若只是 `main` 或 `services` 内部协议，不建议放到这里。
