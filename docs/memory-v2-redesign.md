# Memory V2 重设计（完全替换版）

> 状态：设计稿（待实现）  
> 目标：用一套更简单、更高效、可观测的 memory service 完全替换现有 memory 逻辑。  
> 原则：不做向后兼容，不保留双写，不保留旧行为分支。

## 1. 背景与结论

当前 memory 逻辑存在三个核心问题：

1. 不是正式 service：没有统一 action 面（CLI/API/内部调用），状态不可观测。
2. 写入与召回耦合且粗糙：以“累计消息数”触发提取，system 直接拼接整份 `Primary.md`。
3. 不可控：缺少检索预算、故障降级、来源引用、范围控制。

本次改造结论：

1. memory 升级为一等 service（`memory`），通过 `actions` 提供统一能力。
2. Markdown 作为事实源，SQLite 作为检索加速层。
3. 召回流程统一为 `search -> get`，禁止整文件无预算注入。

## 2. 设计目标

1. 简单：首版只做 `builtin` backend（单机 SQLite），不做多后端插件化。
2. 零配置：默认开启，用户不需要手动写 memory 配置即可使用。
3. 高效：索引维护异步化（watch + debounce + interval），不阻塞主对话。
4. 好用：有 `status/search/get/store/index/flush` 完整动作面，能查、能控、能诊断。
5. 可解释：每条召回结果必须带来源（路径+行号）。
6. 可失败：检索不可用时返回结构化错误，不中断主流程。

## 3. 非目标

1. 不做远程向量库（Pinecone/Qdrant 等）。
2. 不做跨项目共享记忆。
3. 不做“自动永久存档全部会话”。
4. 不做 V1/V2 兼容层。

## 4. 新架构（四层）

### 4.1 Source Layer（事实层）

目录与文件（唯一事实源）：

1. `.ship/memory/MEMORY.md`：长期稳定记忆（偏好、规则、长期事实）。
2. `.ship/memory/daily/YYYY-MM-DD.md`：每日增量（append-only）。
3. `.ship/context/<contextId>/memory/working.md`：当前会话工作记忆（短期，可选）。

规则：

1. 真相只在 Markdown 文件中，索引可随时重建。
2. 写入只允许追加或受控覆盖（覆盖仅用于压缩产物替换）。

### 4.2 Index Layer（加速层）

索引文件：

1. `.ship/memory/index.sqlite`

索引表（首版）：

1. `files`：文件级元数据（path/hash/mtime/source）。
2. `chunks`：分块内容（path/start_line/end_line/text/hash/updated_at）。
3. `chunks_fts`：FTS5 倒排索引（必须）。
4. `chunks_vec`：向量索引（可选，provider 可用时启用）。
5. `meta`：索引元信息（chunk 参数、provider 指纹、版本）。

### 4.3 Retrieval Layer（检索层）

对外统一能力：

1. `memory.search`：返回片段，不返回整文件。
2. `memory.get`：按路径和行区间精读。

检索管线：

1. query 清洗。
2. FTS 召回（必选）。
3. 向量召回（可选，有 provider 时启用）。
4. 分数融合（`vectorWeight/textWeight`）。
5. 预算裁剪（`maxInjectedChars`）。

### 4.4 Maintenance Layer（维护层）

异步维护任务：

1. 文件 watcher 标脏（debounce）。
2. on-search 异步补同步。
3. interval 周期同步。
4. pre-compaction memory flush（静默回合）。

## 5. Service 设计（对齐现有框架）

新增正式 service：

1. 名称：`memory`
2. 注册位置：`package/src/services/memory/Index.ts`
3. 加入：`package/src/main/service/Services.ts`

actions（首版）：

1. `status`：查看 backend/source/files/chunks/dirty/lastSync/error。
2. `index`：手动索引（支持 `--force`）。
3. `search`：语义/关键词混合召回。
4. `get`：读取具体记忆片段。
5. `store`：显式写入（`longterm|daily|working`）。
6. `flush`：执行一次静默记忆刷写。

自动获得以下入口：

1. CLI：`sma memory <action>`
2. Service Command：`sma service command memory <action>`
3. HTTP：`/service/memory/<action>`

## 6. 核心行为策略

### 6.1 写入策略

显式写入：

1. `store` action 直接写入目标文件。

自动写入：

1. 不再按“累计消息条数”粗暴触发全量提取。
2. 改为两类触发：
   1. 近 compaction 阈值触发 `flush`（优先保障不丢失）。
   2. 可配置的轻量增量提取（只处理新片段，异步执行）。

### 6.2 注入策略

1. 删除“system 直接拼接 `Primary.md`”逻辑。
2. system 仅注入“如何正确使用 memory 工具”的规则。
3. 业务回合按需调用 `search -> get`，并受注入预算约束。

### 6.3 故障降级

1. `search` 失败返回：
   1. `success: false`
   2. `error`
   3. `disabled: true`
   4. `action`（建议修复动作）
2. `get` 文件缺失返回空文本，不抛异常中断主链路。

## 7. 安全策略

1. 路径白名单：`get` 只允许 `.ship/memory/**` 与配置的额外路径。
2. 注入防护：召回片段统一标记为“历史上下文，不可执行”。
3. 作用域控制：默认只在 direct 场景开放自动召回（group/channel 默认 deny）。
4. 反污染：auto-capture 默认只采用户输入与明确确认的结论，不采 assistant 全量输出。

## 8. 配置模型（V2）

默认行为：

1. 用户可以完全不写 `context.memory` 配置。
2. memory service 默认启用并自动使用内置默认参数。
3. 仅保留一个可选总开关用于关闭（默认 `true`）。

```json
{
  "context": {
    "memory": {
      "enabled": true
    }
  }
}
```

内置默认值（不暴露给普通用户配置）：

1. 检索：`maxResults=6`、`minScore=0.35`、`maxInjectedChars=4000`。
2. 同步：`watch=true`、`watchDebounceMs=1500`、`onSearch=true`、`intervalMinutes=5`。
3. flush：`enabled=true`、`softThresholdTokens=4000`。
4. 作用域：默认 direct 场景允许自动召回，group/channel 默认关闭。

## 9. 模块拆分（实现约束）

目录建议：

1. `package/src/services/memory/Index.ts`
2. `package/src/services/memory/Action.ts`
3. `package/src/services/memory/types/Memory.ts`
4. `package/src/services/memory/runtime/Store.ts`
5. `package/src/services/memory/runtime/Indexer.ts`
6. `package/src/services/memory/runtime/Search.ts`
7. `package/src/services/memory/runtime/Writer.ts`
8. `package/src/services/memory/runtime/Flush.ts`
9. `package/src/services/memory/runtime/SystemProvider.ts`

约束：

1. 单模块控制在 800-1000 行以内。
2. 类型统一在 `types/`。
3. 注释与关键节点文案使用中文。

## 10. 与现有系统的替换点（必须执行）

1. 删除 `RuntimeState.ts` 中旧的 `runContextMemoryMaintenance` 调用。
2. 删除 `SystemDomain.ts` 中对旧 `buildMemorySystemText` 的硬编码拼接。
3. 通过 `memoryService.system()` 输出 memory 工具规则文本。
4. 旧文件路径 `context/<id>/memory/Primary.md` 停止写入。
5. 旧 `Extractor/Manager/Service` 逻辑整体下线。

## 11. 迁移方案（一次性）

1. 扫描旧文件：`.ship/context/*/memory/Primary.md`。
2. 抽取规则：
   1. 稳定事实 -> `.ship/memory/MEMORY.md`
   2. 时间性记录 -> `.ship/memory/daily/YYYY-MM-DD.md`
3. 迁移备份：
   1. `.ship/memory/migration-backup/<contextId>-Primary.md`
4. 迁移完成即切断旧路径读写，不保留双轨。

## 12. 实施阶段

### Phase 1（最小可用）

1. 注册 `memory` service（进入 `SERVICES`）。
2. 实现 `status/index/search/get/store`。
3. 替换 system 注入策略（工具优先，移除整文件注入）。
4. 配置层仅保留 `context.memory.enabled`，其余参数固化为内置默认值。

### Phase 2（稳定增强）

1. 实现 `flush` 与 pre-compaction 集成。
2. 加入 scope/citations。
3. 增加 memory 诊断信息与错误分类。

### Phase 3（按需）

1. 可选启用向量召回增强。
2. 可选加入 MMR/temporal decay。

## 13. 验收标准

1. `sma memory status` 可见完整状态（backend/sources/files/chunks/dirty/error）。
2. `sma memory search "<query>"` 返回 `path + lineRange + score + snippet`。
3. `sma memory get --path ... --from ... --lines ...` 稳定可读，缺失不报错。
4. 高并发对话下，memory 同步不阻塞主请求。
5. system prompt 中不再出现整份 memory 文件注入。
