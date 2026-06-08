/**
 * Side Panel 对话输入类型。
 *
 * 关键点（中文）：
 * - 输入框只传递用户文本与引用，不暴露 UI 内部 DOM 状态。
 * - 引用类型保持最小集合：当前页面与选中文本。
 */

/**
 * Composer 引用类型。
 */
export type ComposerReferenceType = "page" | "selection";

/**
 * Composer 引用。
 */
export interface ComposerReference {
  /**
   * 引用 id，用于 UI 删除与渲染 key。
   */
  id: string;

  /**
   * 引用类型，用于构建发送给 Agent 的上下文。
   */
  type: ComposerReferenceType;

  /**
   * 用户可见标签，通常是页面域名路径或选中文本摘要。
   */
  label: string;

  /**
   * 引用来源 URL，当前页面引用会包含该字段。
   */
  url?: string;

  /**
   * 引用文本内容，选中文本引用会包含该字段。
   */
  text?: string;
}

/**
 * Composer 发送内容。
 */
export interface ComposerSubmitPayload {
  /**
   * 用户输入的自然语言文本。
   */
  text: string;

  /**
   * 随本次消息一起发送的上下文引用。
   */
  references: ComposerReference[];
}
