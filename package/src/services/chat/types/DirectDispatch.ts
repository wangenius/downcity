/**
 * Direct dispatch 协议类型。
 *
 * 关键点（中文）
 * - 仅用于 `services.chat.method = direct` 的 assistant 出站解析。
 * - 目标是让模型在“纯文本默认发送”的基础上，按需携带结构化参数。
 */

export type DirectFileType = "document" | "photo" | "voice" | "audio";

/**
 * 解析后的附件标签参数（来自 `<file>` 标签）。
 */
export interface DirectFileTagPayload {
  /**
   * 附件在项目内的相对路径。
   *
   * 说明（中文）
   * - 该路径会被拼接进平台可识别的附件指令。
   * - 不能为空字符串。
   */
  path: string;

  /**
   * 附件类型。
   *
   * 说明（中文）
   * - 若缺省，默认使用 `document`。
   * - 仅允许 `document/photo/voice/audio` 四种值。
   */
  type: DirectFileType;

  /**
   * 可选附件说明。
   *
   * 说明（中文）
   * - 存在时会跟随附件一起发送给用户。
   */
  caption?: string;
}

/**
 * 解析后的反应参数（来自 frontmatter metadata）。
 */
export interface DirectReactTagPayload {
  /**
   * 表情内容（如 👍 / 🔥）。
   *
   * 说明（中文）
   * - 不能为空字符串。
   */
  emoji: string;

  /**
   * 可选目标会话键。
   *
   * 说明（中文）
   * - 缺省时使用当前会话。
   */
  chatKey?: string;

  /**
   * 可选目标消息 ID。
   *
   * 说明（中文）
   * - 提供时会优先贴到该消息。
   * - 未提供时可回退到主文本的 `reply/message_id`（同一 chatKey 下）。
   */
  messageId?: string;

  /**
   * 是否使用大表情。
   *
   * 说明（中文）
   * - 仅平台支持时生效（如 Telegram）。
   */
  big?: boolean;
}

/**
 * 运行时主文本发送参数（可直接用于发送）。
 */
export interface ResolvedDirectTextPayload {
  /**
   * 用户可见正文（已 trim，非空）。
   */
  text: string;

  /**
   * 最终目标会话键（已回填默认值）。
   */
  chatKey: string;

  /**
   * 是否以 reply 语义发送正文。
   *
   * 说明（中文）
   * - 当 metadata 提供 `reply`（message_id）或 `message_id/messageId` 时自动为 true。
   * - `reply` 必须是目标 `message_id`，不接受布尔值。
   */
  replyToMessage: boolean;

  /**
   * 可选 reply 目标消息 ID。
   *
   * 说明（中文）
   * - 来自 metadata 的 `reply`（message_id）或 `message_id/messageId`。
   */
  messageId?: string;
}

/**
 * 运行时反应发送参数（可直接用于发送）。
 */
export interface ResolvedDirectReactionPayload {
  /**
   * 表情内容（已 trim，非空）。
   */
  emoji: string;

  /**
   * 最终目标会话键（已回填默认值）。
   */
  chatKey: string;

  /**
   * 可选目标消息 ID。
   */
  messageId?: string;

  /**
   * 是否使用大表情。
   */
  big: boolean;
}

/**
 * direct 模式一次 assistant 输出的完整执行计划。
 */
export interface ResolvedDirectDispatchPlan {
  /**
   * 主文本发送计划。
   *
   * 说明（中文）
   * - 为空表示本轮没有可发送正文（例如只有 reaction metadata）。
   */
  text: ResolvedDirectTextPayload | null;

  /**
   * 反应动作计划列表。
   *
   * 说明（中文）
   * - 允许一次输出触发多个反应动作。
   */
  reactions: ResolvedDirectReactionPayload[];
}
