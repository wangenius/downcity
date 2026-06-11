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

/**
 * 页面选中文本引用消息。
 */
export interface SelectionReferenceMessage {
  /**
   * 消息类型。
   */
  type: "downcity.side-panel.insert-selection-reference";

  /**
   * 引用消息 id，用于 Side Panel 去重。
   */
  id: string;

  /**
   * 选中文本内容。
   */
  text: string;

  /**
   * 选中文本所在页面标题。
   */
  pageTitle: string;

  /**
   * 选中文本所在页面 URL。
   */
  pageUrl: string;
}

/**
 * 页面选中文本读取响应。
 */
export interface PageSelectionReadResponse {
  /**
   * 当前选中文本。
   */
  text: string;

  /**
   * 选中文本所在页面标题。
   */
  pageTitle: string;

  /**
   * 选中文本所在页面 URL。
   */
  pageUrl: string;
}

/**
 * Side Panel 输入框聚焦消息。
 */
export interface FocusComposerMessage {
  /**
   * 消息类型。
   */
  type: "downcity.side-panel.focus-composer";
}

/**
 * Side Panel 关闭请求消息。
 */
export interface CloseSidePanelMessage {
  /**
   * 消息类型。
   */
  type: "downcity.side-panel.close";
}

/**
 * Side Panel 自关闭消息。
 */
export interface CloseSidePanelSelfMessage {
  /**
   * 消息类型。
   */
  type: "downcity.side-panel.close-self";
}

/**
 * Side Panel ready 响应。
 */
export interface SidePanelReadyResponse {
  /**
   * 待插入的选中文本引用。
   */
  reference?: SelectionReferenceMessage | null;

  /**
   * 是否需要在初始化后聚焦输入框。
   */
  focusComposer?: boolean;
}
