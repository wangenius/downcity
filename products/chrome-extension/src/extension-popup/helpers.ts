/**
 * Extension Popup 纯工具函数。
 *
 * 关键点（中文）：
 * - 仅承载无副作用的字符串/样式/展示工具。
 * - 避免主界面组件混入过多与状态无关的细节处理。
 */

import { decorateAuthErrorText } from "../services/auth";
import {
  buildServerConnectionBaseUrl,
  resolveSelectedConnection,
} from "../services/serverConnection";
import { DEFAULT_SETTINGS } from "../services/storage";
import type { ActiveTabContext, ExtensionSettings } from "../types/extension";

/**
 * Extension Popup toast 消息。
 */
export interface ExtensionPopupToastMessage {
  /**
   * toast 类型。
   */
  type: "success" | "error";
  /**
   * toast 文案。
   */
  text: string;
}

/**
 * 读取错误文本。
 */
export function readErrorText(error: unknown): string {
  const rawMessage =
    error instanceof Error ? error.message : String(error || "未知错误");
  const decorated = decorateAuthErrorText(rawMessage);
  if (/failed to fetch/i.test(decorated)) {
    return "无法连接到 Server，请确认 Server 正在运行，并检查扩展设置中的 Protocol / Host / Port / Base Path 是否可访问";
  }
  return decorated;
}

/**
 * 解析扩展弹窗当前应使用的 Console 地址。
 */
export function resolveExtensionPopupServerBaseUrl(settings: ExtensionSettings): {
  /**
   * 最终 Base URL。
   */
  baseUrl: string;
  /**
   * 失败时的错误文案。
   */
  errorText?: string;
} {
  try {
    const connection = resolveSelectedConnection(settings);
    if (!connection) {
      throw new Error("未找到可用的 Server Connection");
    }
    return {
      baseUrl: buildServerConnectionBaseUrl(connection),
    };
  } catch (error) {
    return {
      baseUrl: "",
      errorText: readErrorText(error),
    };
  }
}

/**
 * 生成发送给 Agent 的说明文本。
 */
export function buildExtensionPopupInstructions(params: {
  /**
   * 当前活动标签页。
   */
  tab: ActiveTabContext;
  /**
   * 用户输入的 ask。
   */
  taskPrompt: string;
  /**
   * Markdown 文件名。
   */
  markdownFileName: string;
}): string {
  const safeUrl = params.tab.url || "N/A";
  const userPrompt = String(params.taskPrompt || "").trim();
  return [
    `我浏览到了这个网页，${safeUrl}， 网页的内容保存到了（可能保存下来的有问题）：${params.markdownFileName}`,
    `${userPrompt || "请阅读附件并按需求处理。"}`,
  ].join("\n");
}

/**
 * 缩短 URL 供扩展弹窗展示。
 */
export function shortenUrl(value: string): string {
  const text = String(value || "").trim();
  if (!text) return "（当前页面 URL 不可用）";
  if (text.length <= 72) return text;
  return `${text.slice(0, 69)}...`;
}

/**
 * 归一化初始 taskPrompt。
 */
export function normalizeInitialTaskPrompt(value: string): string {
  const incoming = String(value || "").trim();
  const defaultPrompt = String(DEFAULT_SETTINGS.taskPrompt || "").trim();
  if (!incoming) return "";
  if (incoming === defaultPrompt) return "";
  return incoming;
}

/**
 * 计算 toast 样式。
 */
export function getToastToneClass(type: ExtensionPopupToastMessage["type"]): string {
  return type === "error"
    ? "border-[#d9b2ae] bg-[#faf5f5] text-[#7f1d1d]"
    : "border-border bg-surface text-foreground";
}

/**
 * 格式化历史时间。
 */
export function formatHistoryTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
