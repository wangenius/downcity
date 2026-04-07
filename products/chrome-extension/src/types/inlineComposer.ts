/**
 * Inline Composer 类型定义。
 *
 * 关键点（中文）：
 * - 统一收口页内输入框的状态、路由结果与页面快照结构。
 * - 避免在 inline-composer 模块中散落匿名对象类型。
 */

import type { ConsoleUiAgentOption } from "./api";
import type { ExtensionSettings } from "./extension";

/**
 * 选区矩形快照。
 */
export interface SelectionRectSnapshot {
  /**
   * 选区左侧相对视口位置。
   */
  left: number;

  /**
   * 选区顶部相对视口位置。
   */
  top: number;

  /**
   * 选区宽度。
   */
  width: number;

  /**
   * 选区高度。
   */
  height: number;
}

/**
 * 页面图片引用。
 */
export interface PageImageReference {
  /**
   * 图片最终解析出的绝对 URL。
   */
  url: string;

  /**
   * 图片替代文本或推导出的说明。
   */
  alt: string;

  /**
   * 图片标题属性或补充说明。
   */
  title: string;
}

/**
 * 页面快照。
 */
export interface PageContentSnapshot {
  /**
   * 提取出的正文文本。
   */
  text: string;

  /**
   * 与正文同区域解析出的图片列表。
   */
  images: PageImageReference[];
}

/**
 * Inline Composer 使用的路由设置。
 */
export interface InlineComposerRouteSettings
  extends Pick<
    ExtensionSettings,
    "consoleHost" | "consolePort" | "agentId" | "chatKey"
  > {
  /**
   * 当前本地鉴权状态里的 Bearer Token。
   */
  authToken: string;
}

/**
 * slash 历史命令项。
 */
export interface AskHistoryCommand {
  /**
   * 本地唯一标识，仅用于列表渲染。
   */
  id: string;

  /**
   * 对应的历史提问内容。
   */
  prompt: string;

  /**
   * 供用户感知的快捷命令，如 `/h1`。
   */
  command: string;

  /**
   * 用于搜索匹配的归一化文本。
   */
  searchText: string;
}

/**
 * 路由面板中的 Chat 选项。
 */
export interface InlineComposerChatOption {
  /**
   * 可执行的 chatKey。
   */
  chatKey: string;

  /**
   * 渠道名称。
   */
  channel: "telegram" | "feishu" | "qq";

  /**
   * 面板展示标题。
   */
  title: string;

  /**
   * 最近更新时间戳。
   */
  updatedAt: number;

  /**
   * 上下文消息数。
   */
  messageCount: number;
}

/**
 * 路由解析结果。
 */
export interface RouteInfo {
  /**
   * 当前解析生效的设置快照。
   */
  settings: InlineComposerRouteSettings;

  /**
   * Console 基础地址。
   */
  baseUrl: string;

  /**
   * 可用 Agent 列表。
   */
  agents: ConsoleUiAgentOption[];

  /**
   * 过滤后的 Chat 列表。
   */
  chatOptions: InlineComposerChatOption[];

  /**
   * 实际命中的 Agent。
   */
  targetAgent: ConsoleUiAgentOption;

  /**
   * 实际命中的 chatKey。
   */
  targetChatKey: string;
}

/**
 * 页面元信息。
 */
export interface SafePageMeta {
  /**
   * 页面标题。
   */
  title: string;

  /**
   * 页面 URL。
   */
  url: string;

  /**
   * 页面语言。
   */
  lang: string;
}

/**
 * 发送来源类型。
 */
export type ContentSourceType = "selection" | "page";

/**
 * 发送返回结果。
 */
export interface SendToAgentResult {
  /**
   * 用于 UI 展示的 Agent 标签。
   */
  agentLabel: string;
}

/**
 * 页内发送所需参数。
 */
export interface SendPageContextParams {
  /**
   * 页面标题。
   */
  pageTitle: string;

  /**
   * 页面 URL。
   */
  pageUrl: string;

  /**
   * 页面语言。
   */
  pageLang: string;

  /**
   * 本次发送的正文文本。
   */
  contentText: string;

  /**
   * 与正文一起附加的图片引用。
   */
  images: PageImageReference[];

  /**
   * 当前发送是选区还是整页。
   */
  sourceType: ContentSourceType;

  /**
   * 用户输入的任务说明。
   */
  taskPrompt: string;
}

/**
 * 挂载后的 UI 节点集合。
 */
export interface MountedInlineComposerUi {
  /**
   * Shadow Host 根节点。
   */
  host: HTMLDivElement;

  /**
   * 选区高亮覆盖层。
   */
  selectionOverlay: HTMLDivElement;

  /**
   * 选区触发器容器。
   */
  trigger: HTMLDivElement;

  /**
   * 触发器按钮。
   */
  triggerBtn: HTMLButtonElement;

  /**
   * 输入框容器。
   */
  composer: HTMLDivElement;

  /**
   * 提问输入框。
   */
  input: HTMLTextAreaElement;

  /**
   * 路由切换按钮。
   */
  routeTrigger: HTMLButtonElement;

  /**
   * 路由面板。
   */
  routePanel: HTMLDivElement;

  /**
   * Agent 列表挂载点。
   */
  agentList: HTMLDivElement;

  /**
   * Chat 列表挂载点。
   */
  chatList: HTMLDivElement;

  /**
   * Agent 标签节点。
   */
  agentTag: HTMLDivElement;

  /**
   * 发送按钮。
   */
  sendBtn: HTMLButtonElement;

  /**
   * slash 建议列表容器。
   */
  slash: HTMLDivElement;

  /**
   * toast 容器。
   */
  toast: HTMLDivElement;
}

/**
 * Inline Composer 运行时状态。
 */
export interface InlineComposerState {
  /**
   * 当前输入面板是否打开。
   */
  isOpen: boolean;

  /**
   * 当前是否正在发送。
   */
  isSending: boolean;

  /**
   * 当前选区文本。
   */
  selectionText: string;

  /**
   * 当前主选区矩形。
   */
  selectionRect: DOMRect | null;

  /**
   * 当前选区高亮矩形集合。
   */
  selectionRects: SelectionRectSnapshot[];

  /**
   * hover 状态下缓存的选区文本。
   */
  hoverSelectionText: string;

  /**
   * hover 状态下缓存的选区矩形。
   */
  hoverSelectionRect: DOMRect | null;

  /**
   * 最近加载的设置快照。
   */
  lastSettings: InlineComposerRouteSettings;

  /**
   * slash 历史命令集合。
   */
  askHistoryCommands: AskHistoryCommand[];

  /**
   * slash 面板当前是否可见。
   */
  slashVisible: boolean;

  /**
   * 当前可见的 slash 建议列表。
   */
  slashSuggestions: AskHistoryCommand[];

  /**
   * 当前高亮的 slash 建议下标。
   */
  slashActiveIndex: number;

  /**
   * 当前路由解析出的 Console 基础地址。
   */
  routeBaseUrl: string;

  /**
   * Agent 标签展示文本。
   */
  agentTagText: string;

  /**
   * 路由错误摘要。
   */
  routeErrorText: string;

  /**
   * 当前是否正在刷新路由。
   */
  isRouteLoading: boolean;

  /**
   * 路由面板是否展开。
   */
  isRoutePanelOpen: boolean;

  /**
   * 当前可选 Agent 列表。
   */
  routeAgents: ConsoleUiAgentOption[];

  /**
   * 当前可选 Chat 列表。
   */
  routeChats: InlineComposerChatOption[];

  /**
   * 当前激活的 Agent id。
   */
  activeAgentId: string;

  /**
   * 当前激活的 chatKey。
   */
  activeChatKey: string;

  /**
   * 路由刷新序列号，用于丢弃过期响应。
   */
  routeRefreshSeq: number;

  /**
   * Toast 定时器 id。
   */
  toastTimerId: number | null;
}
