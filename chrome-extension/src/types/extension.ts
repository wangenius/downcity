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
   * 目标 Console IP/主机名。
   */
  consoleHost: string;

  /**
   * 目标 Console 端口。
   */
  consolePort: number;

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

  /**
   * 常用问题模板列表。
   */
  quickPrompts: ExtensionQuickPromptItem[];

  /**
   * 默认常用问题模板 id（用于 popup 快速填入默认值）。
   */
  defaultQuickPromptId: string;
}

/**
 * 常用问题模板项。
 */
export interface ExtensionQuickPromptItem {
  /**
   * 模板唯一 id（本地生成，跨页面持久化）。
   */
  id: string;

  /**
   * 模板名称（用于下拉展示）。
   */
  title: string;

  /**
   * 模板正文（快速填入任务输入框）。
   */
  prompt: string;
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

/**
 * 当前页面发送记录。
 */
export interface ExtensionPageSendRecord {
  /**
   * 记录唯一 id（本地生成）。
   */
  id: string;

  /**
   * 页面 URL（标准化后，用于当前页面筛选）。
   */
  pageUrl: string;

  /**
   * 发送时页面标题快照。
   */
  pageTitle: string;

  /**
   * 发送目标 Agent id。
   */
  agentId: string;

  /**
   * 发送目标上下文（当前沿用 chatKey 字段名）。
   */
  chatKey: string;

  /**
   * 用户输入的任务说明快照。
   */
  taskPrompt: string;

  /**
   * 发送时附件文件名。
   */
  attachmentFileName: string;

  /**
   * 发送时间戳（毫秒）。
   */
  sentAt: number;
}
