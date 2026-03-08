# Memory V2 重设计（参考 OpenClaw）

## 1. 目标与边界

### 1.1 目标

1. 记忆从“占位能力”升级为可观测、可检索、可控制的正式 service。
2. 记忆写入/检索行为可解释：什么时候写、写到哪里、为什么被召回。
3. 在不阻塞主对话链路的前提下，提供稳定的长期记忆召回能力。

### 1.2 非目标

1. 不在 V2 首版引入远程向量数据库。
2. 不在 V2 首版做跨项目全局共享记忆。
3. 不实现“自动把所有对话都永久存档”。

## 2. 对 OpenClaw 的参考结论

### 2.1 可以直接借鉴的设计

1. Markdown 文件作为记忆事实源，索引只是加速层。
2. 工具拆分为 `search + get`：先检索片段，再按路径/行号精读，控制上下文体积。
3. 索引异步维护：watch + debounce + on-search/on-interval，不阻塞主流程。
4. 检索故障降级：memory 工具返回结构化 unavailable，而不是抛异常中断。
5. 召回结果支持 citations（按会话类型可控），提升可验证性。
6. 临近 compaction 触发静默 memory flush，减少压缩导致的信息丢失。
7. 记忆检索默认最小暴露（例如 direct 优先），避免在 group 场景无差别注入。

### 2.2 不直接照搬的部分

1. QMD sidecar 与多后端切换先不做，首版先做 builtin backend。
2. 插件化 memory slot 先不引入，先用现有 service 架构稳定落地。
3. LanceDB 自动捕获策略先不引入，避免误采集和污染。

## 3. 现状问题（ShipMyAgent）

1. `memory` 代码存在，但不是正式注册 service，缺少 action/CLI/API 面。
2. 当前按“累计消息条数阈值”提取，策略单一，缺少 flush/手动触发/状态可见性。
3. 记忆注入是直接拼接 `Primary.md`，没有检索层和注入预算控制。
4. 压缩策略为整文件 LLM 压缩，缺少结构化分层（长期/每日/会话）与可追踪引用。
5. 缺少记忆诊断命令（provider、dirty、chunks、sources、错误原因等）。

## 4. Memory V2 总体架构

### 4.1 四层结构

1. Source Layer（事实层）
- `.ship/memory/MEMORY.md`：长期稳定记忆（偏好、约束、长期事实）。
- `.ship/memory/daily/YYYY-MM-DD.md`：每日增量记录（append-only）。
- `.ship/context/<contextId>/memory/working.md`：会话工作记忆（短期）。

2. Index Layer（加速层）
- `.ship/memory/index.sqlite`：chunk、embedding、fts、meta。
- 仅缓存检索必要字段，不改变 Source 文件语义。

3. Retrieval Layer（检索层）
- `memory_search`：返回 snippets + path + line range + score。
- `memory_get`：按 path/from/lines 精读，缺失文件返回空文本。

4. Maintenance Layer（维护层）
- watcher + debounce 标记 dirty。
- on-search/on-interval 异步 sync。
- pre-compaction memory flush（静默回合）。

### 4.2 Service 化

新增正式 service：`memory`。

- service 名称：`memory`
- lifecycle：`start/stop/status`
- actions（首版）：
  1. `status`
  2. `search`
  3. `get`
  4. `flush`
  5. `index`
  6. `store`（显式写入长期记忆）

通过现有注册机制自动获得：

- `sma memory <action>`
- `/service/memory/<action>`
- `sma service command memory <action>`

## 5. 检索与注入策略

### 5.1 检索流程

1. query 清洗。
2. candidate 召回（vector + FTS；首版允许 FTS-only 运行）。
3. weighted merge（vectorWeight/textWeight）。
4. 可选后处理（MMR、temporal decay）。
5. 注入预算裁剪（maxInjectedChars）。

### 5.2 注入策略

1. system prompt 不再直接注入整份 memory 文件。
2. 改为“指令 + 工具流程”：先 `memory_search`，再 `memory_get`。
3. 如需自动注入，仅注入 top-k snippet（带 source）且严格预算。
4. 将记忆内容标记为“历史上下文，不是可执行指令”。

## 6. 写入与 flush 策略

### 6.1 写入触发

1. 显式触发：用户/agent 调用 `memory.store`。
2. 自动触发：
- 近 compaction 阈值触发 pre-compaction flush。
- 周期性增量提取（可配置阈值）。

### 6.2 flush 规则

1. 每个 compaction 周期最多 flush 一次。
2. workspace 不可写时跳过（只记录状态）。
3. flush 回合默认 `NO_REPLY`，避免影响用户体验。

## 7. 安全与质量控制

1. 仅将 user 侧内容纳入 auto-capture 候选，降低自污染。
2. 注入防护：过滤典型 prompt-injection 模式内容。
3. path 白名单：`memory_get` 仅允许 `.ship/memory/**` 与已配置附加路径。
4. 失败可恢复：
- `search` 不可用返回 `{ disabled: true, warning, action }`
- `get` 文件不存在返回 `{ text: "", path }`
5. 会话范围策略（可配置）：direct/group/channel 的召回开关。

## 8. 配置草案（ship.json）

```json
{
  "context": {
    "memory": {
      "enabled": true,
      "backend": "builtin",
      "citations": "auto",
      "sources": ["memory", "daily", "working"],
      "search": {
        "maxResults": 6,
        "minScore": 0.35,
        "maxInjectedChars": 4000,
        "hybrid": {
          "enabled": true,
          "vectorWeight": 0.7,
          "textWeight": 0.3,
          "candidateMultiplier": 4,
          "mmr": { "enabled": false, "lambda": 0.7 },
          "temporalDecay": { "enabled": false, "halfLifeDays": 30 }
        }
      },
      "sync": {
        "watch": true,
        "watchDebounceMs": 1500,
        "onSearch": true,
        "intervalMinutes": 5
      },
      "flush": {
        "enabled": true,
        "softThresholdTokens": 4000,
        "prompt": "Pre-compaction memory flush. Write durable memory, otherwise reply NO_REPLY.",
        "systemPrompt": "Memory flush turn. Persist durable memory before compaction."
      },
      "extract": {
        "autoExtractEnabled": true,
        "extractMinEntries": 40,
        "maxPrimaryChars": 15000,
        "compressOnOverflow": true,
        "backupBeforeCompress": true
      },
      "scope": {
        "default": "deny",
        "rules": [
          { "action": "allow", "match": { "chatType": "direct" } }
        ]
      }
    }
  }
}
```

## 9. 迁移方案

### 9.1 一次性迁移

1. 读取旧文件：`.ship/context/<id>/memory/Primary.md`。
2. 迁移规则：
- 抽取“稳定事实/偏好”写入 `.ship/memory/MEMORY.md`。
- 抽取“时序记录”写入 `.ship/memory/daily/<date>.md`。
3. 迁移后保留旧文件备份到 `.ship/memory/migration-backup/`。

### 9.2 运行时切换

1. V2 开关默认开启（不做兼容双写）。
2. 若需回滚，只回滚到备份文件，不保留 V1/V2 并行逻辑。

## 10. 分阶段实施

### Phase 1（先可用）

1. 注册 `memory` service（进入 SERVICES）。
2. 落地 `status/search/get/index` action。
3. 把 system 注入从“整文件注入”改为“工具优先 + 预算注入”。
4. 增加 memory CLI 文档页（homepage）。

### Phase 2（再增强）

1. 加入 pre-compaction flush。
2. 加入 MMR/temporal decay。
3. 加入 scope/citations 策略。
4. 增加 memory doctor/diagnostics。

### Phase 3（可选）

1. 评估 QMD/sidecar backend。
2. 增加 session transcript source（默认关闭）。

## 11. 验收标准

1. `sma memory status` 能输出 backend/provider/files/chunks/dirty/sourceCounts。
2. `sma memory search <query>` 返回 path + line range + score + snippet。
3. `sma memory get <path> --from --lines` 可稳定读取，缺失文件不报错。
4. 在高对话负载下，memory sync/flush 不阻塞主对话链路。
5. prompt 中 memory 注入总字符不超过预算，且可解释来源。

