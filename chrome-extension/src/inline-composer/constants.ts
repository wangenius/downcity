/**
 * Inline Composer 常量。
 *
 * 关键点（中文）：
 * - 把页内输入框的行为上限、尺寸参数和资源路径集中管理。
 * - 避免 UI、路由、页面提取层各自散落魔法数字。
 */

import type { InlineComposerRouteSettings } from "../types/inlineComposer";

/**
 * 发送历史最多保留条数。
 */
export const SEND_HISTORY_MAX_COUNT = 120;

/**
 * 选区正文最大字符数。
 */
export const MAX_SELECTION_TEXT_CHARS = 12_000;

/**
 * 整页正文最大字符数。
 */
export const MAX_PAGE_TEXT_CHARS = 80_000;

/**
 * 用户输入任务说明最大字符数。
 */
export const MAX_PROMPT_CHARS = 5_000;

/**
 * slash 建议最多显示条数。
 */
export const MAX_SLASH_ITEMS = 6;

/**
 * 快照中最多附带图片数量。
 */
export const MAX_PAGE_IMAGE_COUNT = 8;

/**
 * 输入面板最小宽度。
 */
export const COMPOSER_MIN_WIDTH = 320;

/**
 * 输入面板最大宽度。
 */
export const COMPOSER_MAX_WIDTH = 460;

/**
 * 视口边距。
 */
export const VIEWPORT_MARGIN = 10;

/**
 * 触发器图标地址。
 */
export const TRIGGER_ICON_URL = chrome.runtime.getURL("image.png");

/**
 * Inline Composer 样式地址。
 */
export const CONTENT_STYLE_URL = chrome.runtime.getURL("content-script.css");

/**
 * 默认路由设置。
 */
export const DEFAULT_ROUTE_SETTINGS: InlineComposerRouteSettings = {
  consoleHost: "127.0.0.1",
  consolePort: 5315,
  agentId: "",
  chatKey: "",
};
