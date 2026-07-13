/**
 * Agent Chat transcript 导航输入解析器。
 *
 * 统一处理分页键、方向键组合与 SGR 鼠标滚轮事件，避免 Coordinator
 * 和 Editor 分别维护互相冲突的滚动规则。
 */

import { Key, matchesKey } from "@earendil-works/pi-tui";

/** 启用基础鼠标事件与 SGR 扩展坐标编码。 */
export const TRANSCRIPT_MOUSE_TRACKING_ENABLE = "\u001B[?1000h\u001B[?1006h";

/** 恢复终端默认鼠标行为。 */
export const TRANSCRIPT_MOUSE_TRACKING_DISABLE = "\u001B[?1006l\u001B[?1000l";

/** SGR 鼠标事件：button、column、row、press/release。 */
const SGR_MOUSE_EVENT = /^\u001B\[<(\d+);(\d+);(\d+)([Mm])$/;

/** 单次鼠标滚轮滚动的 transcript 行数。 */
const MOUSE_WHEEL_SCROLL_LINES = 3;

/**
 * 将终端输入解析为 transcript 滚动增量。
 *
 * 正数向上查看历史，负数向下返回最新内容；负无穷表示直接回到底部。
 * 无关输入返回 null，继续交给当前焦点组件处理。
 *
 * @param data 单个终端输入序列。
 * @param page_size 当前 transcript 一页可滚动的行数。
 * @returns 滚动增量，或 null。
 */
export function resolve_transcript_scroll_delta(
  data: string,
  page_size: number,
): number | null {
  const safe_page_size = Math.max(1, Math.floor(page_size));
  if (matchesKey(data, Key.pageUp)) return safe_page_size;
  if (matchesKey(data, Key.pageDown)) return -safe_page_size;
  if (matchesKey(data, Key.shift("up"))) return 1;
  if (matchesKey(data, Key.shift("down"))) return -1;
  if (matchesKey(data, Key.ctrl("l"))) return Number.NEGATIVE_INFINITY;

  const mouse_event = data.match(SGR_MOUSE_EVENT);
  if (!mouse_event || mouse_event[4] !== "M") return null;
  const button_code = Number(mouse_event[1]);
  if (button_code === 64) return MOUSE_WHEEL_SCROLL_LINES;
  if (button_code === 65) return -MOUSE_WHEEL_SCROLL_LINES;
  return null;
}
