/**
 * Chrome 插件内部类型定义。
 *
 * 关键点（中文）：
 * - 统一收口 popup 表单、运行状态与页面上下文类型。
 * - 避免在 UI 代码中散落匿名对象类型。
 */

/**
 * 插件设置。
 */
export interface ExtensionSettings {
  /**
   * 目标 Agent id（来自 `/api/ui/agents`）。
   */
  agentId: string;

  /**
   * 结果回传目标 chatKey（来自可选列表）。
   */
  chatKey: string;

  /**
   * 用户补充任务说明。
   */
  taskPrompt: string;
}

/**
 * 当前活动标签页信息。
 */
export interface ActiveTabContext {
  /**
   * 标签页 id。
   */
  tabId: number | null;

  /**
   * 页面标题。
   */
  title: string;

  /**
   * 页面地址。
   */
  url: string;
}

/**
 * 页面 Markdown 快照。
 */
export interface PageMarkdownSnapshot {
  /**
   * 文档标题（用于 Markdown 一级标题）。
   */
  title: string;

  /**
   * 页面链接（用于元信息记录）。
   */
  url: string;

  /**
   * 生成后的 Markdown 正文。
   */
  markdown: string;

  /**
   * 建议附件文件名（例如 `some-page.md`）。
   */
  fileName: string;
}

/**
 * Popup 状态消息。
 */
export interface StatusMessage {
  /**
   * 消息级别。
   */
  type: "idle" | "loading" | "success" | "error";

  /**
   * 展示给用户的主消息。
   */
  text: string;
}
