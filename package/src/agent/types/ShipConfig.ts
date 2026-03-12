/**
 * Ship 配置类型定义。
 *
 * 关键点（中文）
 * - 作为全局共享类型，不挂在 console 目录下。
 * - 供 agent/services 多层复用，避免反向类型依赖。
 */
import type { LlmConfig } from "@agent/types/LlmConfig.js";
import type { VoiceExtensionConfig } from "@agent/types/Voice.js";

export interface ShipConfig {
  $schema?: string;
  name: string;
  version: string;
  description?: string;
  /**
   * Runtime startup configuration used by `shipmyagent agent on`.
   * CLI flags (if provided) take precedence over this config.
   */
  start?: {
    port?: number;
    host?: string;
  };
  /**
   * services 配置。
   *
   * 关键点（中文）
   * - 所有服务相关配置统一收敛到 `services` 下，避免顶层散落字段。
   * - 例如：`services.skills`、`services.chat.channels`。
   */
  services?: {
    /**
     * Claude Code-compatible skills 配置。
     *
     * 默认会扫描：
     * - 项目内：`.agents/skills/`
     * - 用户目录：`~/.agents/skills/`
     */
    skills?: {
      /**
       * Extra skill root directories to scan. Relative paths are resolved from project root.
       * Example: [".agents/skills", ".my/skills"]
       */
      paths?: string[];
      /**
       * Allow scanning skill paths outside the project root (absolute paths or `~`).
       * Default: false.
       */
      allowExternalPaths?: boolean;
    };
    /**
     * Chat service 配置。
     */
    chat?: {
      /**
       * Chat 回复投递方式。
       *
       * 可选值（中文）
       * - `direct`（默认）：将本轮 LLM 生成的 assistant 文本直接投递到当前会话 channel。
       * - `cmd`：通过 shell 执行 `sma chat send` 投递用户可见消息。
       */
      method?: "cmd" | "direct";
      /**
       * Chat 调度队列（按 chatKey 分 lane）。
       */
      queue?: {
        /**
         * 全局最大并发（不同 chatKey 之间）。
         * 默认：2
         */
        maxConcurrency?: number;
        /**
         * 入站消息合并的防抖窗口（毫秒）。
         *
         * 关键点（中文）
         * - 同一 chatKey 在该窗口内连续到达的多条消息，会在一次 run 前一起并入上下文。
         * - 典型场景：用户先发一句话，再紧接着转发链接/卡片。
         * - 设为 `0` 或负数可关闭该能力（立即执行首条消息）。
         *
         * 默认：600
         */
        mergeDebounceMs?: number;
        /**
         * 入站消息合并的最长等待时间（毫秒）。
         *
         * 关键点（中文）
         * - 即使用户持续发送新消息，也不会无限延期；达到该上限后会立刻启动 run。
         * - 用于平衡“尽量合并上下文”与“响应时延可控”。
         * - 当 `mergeDebounceMs <= 0` 时该字段不会生效。
         *
         * 默认：2000
         */
        mergeMaxWaitMs?: number;
      };
      /**
       * 出站（egress）控制：用于限制工具发送、避免重复与无限循环刷屏。
       */
      egress?: {
        /**
         * 单次 agent run 内，`chat_send` 允许调用的最大次数。
         */
        chatSendMaxCallsPerRun?: number;
        /**
         * 是否启用 `chat_send` 幂等去重（基于 inbound messageId + 回复内容 hash）。
         */
        chatSendIdempotency?: boolean;
      };
      /**
       * 消息平台 channel 配置。
       */
      channels?: {
        telegram?: {
          enabled: boolean;
          botToken?: string;
          /**
           * Telegram 主人鉴权 ID（对应 Telegram `from.id`）。
           *
           * 关键点（中文）
           * - 命中即判定为 master。
           * - 会注入到入站 `<info>` 的 `is_master` 字段。
           */
          auth_id?: string;
          /**
           * Group follow-up window in milliseconds.
           * When a user has just talked to the bot (mention/reply/command), allow
           * non-mention follow-up messages within this time window.
           * Default: 10 minutes.
           */
          followupWindowMs?: number;
          /**
           * Who can interact with the bot in group chats.
           * - "anyone" (default): all group members can talk to the bot.
           * - "initiator_or_admin": only the first person who talked to the bot in that chat/topic,
           *   or group admins, can use it.
           */
          groupAccess?: "initiator_or_admin" | "anyone";
        };
        discord?: {
          enabled: boolean;
          botToken?: string;
        };
        feishu?: {
          enabled: boolean;
          appId?: string;
          appSecret?: string;
          domain?: string;
          /**
           * Feishu 主人鉴权 ID（对应事件中的发送者 ID）。
           */
          auth_id?: string;
        };
        qq?: {
          enabled: boolean;
          appId?: string; // 机器人ID
          appSecret?: string; // 密钥
          sandbox?: boolean; // 是否使用沙箱环境
          /**
           * QQ 主人鉴权 ID（对应事件中的发送者 ID）。
           */
          auth_id?: string;
          /**
           * 群聊权限门禁：
           * - "anyone"（默认）：群成员都可触发机器人。
           * - "initiator_or_admin"：仅发起人或管理员可触发机器人。
           */
          groupAccess?: "initiator_or_admin" | "anyone";
        };
      };
    };
  };
  /**
   * extensions 配置。
   *
   * 关键点（中文）
   * - 扩展能力统一放在 `extensions` 下，供 service 调用。
   * - 示例：`extensions.voice`。
   */
  extensions?: {
    /**
     * Voice extension（本地语音识别）配置。
     *
     * 关键点（中文）
     * - 负责统一管理 STT 模型目录、启停开关、激活模型与转写执行策略。
     * - 可通过 `sma voice ...` 命令组维护，不需要手改 JSON。
     */
    voice?: VoiceExtensionConfig;
  };
  /**
   * LLM 配置。
   *
   * 关键点（中文）
   * - 通过 `activeModel` 选择当前模型。
   * - `providers` 存连接信息（type/baseUrl/apiKey）。
   * - `models` 存模型名称与采样参数。
   */
  llm: LlmConfig;
  /**
   * 上下文管理（工程向配置）。
   *
   * 说明
   * - 对话消息以 UIMessage[] 为唯一事实源（.ship/context/<contextId>/messages/messages.jsonl）。
   * - Agent 每次执行直接把 UIMessage[] 转成 ModelMessage[] 作为 messages 输入。
   * - 超出上下文窗口时会自动 compact（更早段压缩为摘要 + 保留最近窗口）。
   */
  context?: {
    /**
     * messages（唯一上下文消息来源）的 compact 策略。
     */
    messages?: {
      /**
       * 历史兼容字段（保留）。
       *
       * 说明（中文）
       * - 当前默认策略按 `compactRatio` 压缩前段消息。
       * - 该字段仍会写入 compact 元信息，便于观测与旧配置兼容。
       *
       * 默认：30
       */
      keepLastMessages?: number;
      /**
       * 输入预算（近似 token 数）。
       *
       * 说明（中文）
       * - 这里是近似值，用于在调用 provider 前提前触发 compact
       * - 实际超窗仍会被 provider 拒绝并进入 retry（更激进 compact）
       *
       * 默认：128000
       */
      maxInputTokensApprox?: number;
      /**
       * compact 时是否归档被折叠的原始消息段（写入 messages/archive/）。
       * 默认：true
       */
      archiveOnCompact?: boolean;

      /**
       * 前段压缩比例（0-1）。
       *
       * 说明（中文）
       * - 触发 compact 后，优先压缩最早一段消息。
       * - `0.5` 代表优先压缩“最早 50% 的 UIMessage”。
       * - 实际切分会做边界保护（至少保留 1 条最近消息）。
       *
       * 默认：0.5
       */
      compactRatio?: number;
    };
    /**
     * 记忆管理配置。
     *
     * 设计目标
     * - 默认开启，开箱即用（零配置）
     * - 仅保留总开关，避免复杂配置负担
     */
    memory?: {
      enabled?: boolean;
    };
  };
  permissions?: {
    read_repo: boolean | { paths?: string[] };
    write_repo?:
      | boolean
      | {
          paths?: string[];
          requiresApproval: boolean;
        };
    exec_command?:
      | boolean
      | {
          deny?: string[];
          allow?: string[];
          requiresApproval: boolean;
          denyRequiresApproval?: boolean;
          /**
           * `exec_command` / `write_stdin` 返回给模型的输出最大字符数。
           *
           * 说明（中文）
           * - 工具结果会进入下一轮 LLM messages。
           * - 过大时可能触发 provider 参数校验失败。
           * 默认值：12000。
           */
          maxOutputChars?: number;
          /**
           * `exec_command` / `write_stdin` 返回给模型的输出最大行数。
           * 默认值：200。
           */
          maxOutputLines?: number;
        };
    open_pr?: boolean;
    merge?: boolean;
  };
}
