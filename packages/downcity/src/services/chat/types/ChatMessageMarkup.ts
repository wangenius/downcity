/**
 * Chat 消息标记语法类型。
 *
 * 关键点（中文）
 * - 统一描述 chat service 中可见的消息协议：frontmatter metadata + `<file>` 标签。
 * - direct 模式、`city chat send`、入站附件注入、渠道出站解析都应复用本类型。
 */

/**
 * `<file>` 标签支持的附件类型。
 *
 * 说明（中文）
 * - 语义集合与 Telegram/Feishu 当前支持的附件能力保持一致。
 * - 默认类型为 `document`。
 */
export type ChatMessageFileType =
  | "document"
  | "photo"
  | "voice"
  | "audio"
  | "video";

/**
 * 一条 `<file>` 标签解析后的结构。
 */
export interface ChatMessageFileTag {
  /**
   * 附件路径。
   *
   * 说明（中文）
   * - 当前主要使用项目内相对路径。
   * - 渠道可自行决定是否支持绝对路径或远程 URL。
   */
  path: string;

  /**
   * 附件类型。
   *
   * 说明（中文）
   * - 缺省时按 `document` 处理。
   */
  type: ChatMessageFileType;

  /**
   * 可选附件说明。
   *
   * 说明（中文）
   * - 存在时由渠道决定如何发送给最终用户。
   */
  caption?: string;
}

/**
 * 一段 chat 消息正文解析后的结果。
 */
export interface ParsedChatMessageMarkup {
  /**
   * frontmatter metadata 原始对象。
   *
   * 说明（中文）
   * - 只在正文最顶部存在合法 YAML frontmatter 时才会填充。
   * - 解析失败时会退化为 `{}`，避免误删正文。
   */
  metadata: Record<string, unknown>;

  /**
   * 去掉 frontmatter 与 `<file>` 标签后的纯正文。
   */
  bodyText: string;

  /**
   * 按出现顺序提取出的附件标签列表。
   */
  files: ChatMessageFileTag[];
}

/**
 * 由 frontmatter metadata 解析出的发送参数。
 */
export interface ChatMessageSendOptions {
  /**
   * 目标 chatKey。
   *
   * 说明（中文）
   * - 未提供时由调用方回退到当前上下文或显式参数。
   */
  chatKey?: string;

  /**
   * 延迟发送毫秒数。
   *
   * 说明（中文）
   * - 由 `delay/delayMs/delay-ms` 解析得到。
   */
  delayMs?: number;

  /**
   * 定时发送的绝对毫秒时间戳。
   *
   * 说明（中文）
   * - 由 `time/sendAt/sendAtMs` 等字段解析得到。
   */
  sendAtMs?: number;

  /**
   * 是否使用 reply 语义发送。
   *
   * 说明（中文）
   * - 允许仅设置布尔值，也允许结合 `messageId` 一起使用。
   */
  replyToMessage?: boolean;

  /**
   * 可选目标消息 ID。
   *
   * 说明（中文）
   * - 当前主要用于 Telegram/Feishu reply 场景。
   */
  messageId?: string;
}
