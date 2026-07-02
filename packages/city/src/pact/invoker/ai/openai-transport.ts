/**
 * OpenAI-compatible transport 适配模块。
 *
 * 关键点（中文）
 * - 只提供 `baseURL`，不绑定具体 AI SDK provider。
 * - 本机 Federation 也应暴露 loopback HTTP URL，因此不需要自定义协议 fetch。
 */

/**
 * OpenAI-compatible provider 可复用的 transport 选项。
 */
export interface OpenAICompatibleTransport {
  /**
   * OpenAI-compatible AI endpoint 根地址，例如 `https://host/v1/ai`
   * 或 `http://127.0.0.1:15315/v1/ai`。
   */
  baseURL: string;
}

/**
 * 创建 OpenAI-compatible transport。
 */
export function create_openai_compatible_transport(
  federation_url: string,
): OpenAICompatibleTransport {
  return { baseURL: `${federation_url.replace(/\/+$/, "")}/v1/ai` };
}
