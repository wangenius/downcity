/**
 * Ship 配置类型定义。
 *
 * 关键点（中文）
 * - 作为全局共享类型，不挂在 console 目录下。
 * - 供 agent、services、console 宿主层多处复用，避免反向类型依赖。
 */
import type { LlmConfig } from "@agent/types/LlmConfig.js";
import type { AgentModelBindingConfig } from "@agent/types/ModelBinding.js";
import type { JsonObject } from "@/types/Json.js";

export interface ShipConfig {
  $schema?: string;
  name: string;
  version: string;
  description?: string;
  /**
   * Runtime startup configuration used by `downcity agent start`.
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
       * - `cmd`：通过 shell 执行 `city chat send` 投递用户可见消息。
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
          /**
           * 绑定的 channel account id（来源：console 全局 `~/.downcity/downcity.db`）。
           */
          channelAccountId?: string;
        };
        feishu?: {
          enabled: boolean;
          /**
           * 绑定的 channel account id（来源：console 全局 `~/.downcity/downcity.db`）。
           */
          channelAccountId?: string;
        };
        qq?: {
          enabled: boolean;
          /**
           * 绑定的 channel account id（来源：console 全局 `~/.downcity/downcity.db`）。
           */
          channelAccountId?: string;
        };
      };
    };
  };
  /**
   * plugins 配置。
   *
   * 关键点（中文）
   * - 新插件体系的行为配置统一收敛到该字段。
   * - key 为 plugin 名称，value 为对应插件的结构化配置对象。
   * - 当前阶段允许各 plugin 自定义字段，但必须保持 JSON 可序列化。
   */
  plugins?: {
    /**
     * 插件配置对象映射。
     */
    [pluginName: string]: JsonObject;
  };
  /**
   * assets 配置。
   *
   * 关键点（中文）
   * - 新资产体系的底层资源配置统一收敛到该字段。
   * - key 为 asset 名称，value 为对应资产的结构化配置对象。
   * - 插件应只依赖 asset 名称，不直接理解 value 内部实现细节。
   */
  assets?: {
    /**
     * 资产配置对象映射。
     */
    [assetName: string]: JsonObject;
  };
  /**
   * Agent 模型绑定配置。
   *
   * 关键点（中文）
   * - agent 只声明绑定关系（`model.primary`）。
   * - provider/models 的完整配置统一由 console 全局 `~/.downcity/downcity.db` 管理。
   */
  model?: AgentModelBindingConfig;
  /**
   * LLM 全量配置（通常来自 console 全局层合并结果）。
   *
   * 关键点（中文）
   * - 运行时会读取该字段创建真实模型实例。
   * - 对于项目内 `downcity.json`，通常不需要显式写该字段。
   */
  llm?: LlmConfig;
  /**
   * 上下文管理（工程向配置）。
   *
   * 说明
   * - 对话消息以 UIMessage[] 为唯一事实源（`.downcity/session/<sessionId>/messages/messages.jsonl`）。
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
}
