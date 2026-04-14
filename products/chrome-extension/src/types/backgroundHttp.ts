/**
 * Chrome 扩展后台 HTTP 桥类型定义。
 *
 * 关键点（中文）：
 * - Content Script 通过 runtime message 请求 background 代发 HTTP。
 * - 避免 HTTPS 页面直接请求 HTTP Console 时触发 Mixed Content。
 */

/**
 * 后台 HTTP 桥消息类型字面量。
 */
export type DowncityExtensionHttpRequestMessageType =
  "downcity.extension.http.request";

/**
 * 后台 HTTP 请求描述。
 */
export interface DowncityExtensionHttpRequest {
  /**
   * 请求完整 URL。
   */
  url: string;

  /**
   * 请求方法；未提供时由 background 使用 GET。
   */
  method?: string;

  /**
   * 请求头；仅使用可结构化克隆的字符串字典。
   */
  headers?: Record<string, string>;

  /**
   * 请求正文；当前仅传递 JSON 字符串或纯文本。
   */
  body?: string;
}

/**
 * Content Script 发往 background 的 HTTP 请求消息。
 */
export interface DowncityExtensionHttpRequestMessage {
  /**
   * 固定消息类型，用于区分扩展内部消息。
   */
  type: DowncityExtensionHttpRequestMessageType;

  /**
   * 待 background 执行的 HTTP 请求。
   */
  request: DowncityExtensionHttpRequest;
}

/**
 * background 返回给 Content Script 的 HTTP 响应快照。
 */
export interface DowncityExtensionHttpResponse {
  /**
   * HTTP 状态是否为 2xx。
   */
  ok: boolean;

  /**
   * HTTP 状态码；网络层失败时为 0。
   */
  status: number;

  /**
   * HTTP 状态文本；网络层失败时为空字符串。
   */
  statusText: string;

  /**
   * 响应正文文本。
   */
  text: string;

  /**
   * background 或网络层错误信息。
   */
  error?: string;
}
