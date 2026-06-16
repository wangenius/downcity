/**
 * AI SDK UIMessage stream 解析（对应 core AIService stream handler 的输出）。
 */

import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import type { RawStreamBody } from "../../http.js";
import type { UserStreamResult } from "../../user/types.js";

/** 解析 AI SDK UIMessage SSE body */
export function parseAIStreamBody(body: RawStreamBody): UserStreamResult {
  if (!body) throw new Error("Downcity stream response body is empty");
  return parser.parse(body);
}

class Parser extends DefaultChatTransport<UIMessage> {
  parse(stream: ReadableStream<Uint8Array>): UserStreamResult {
    return this.processResponseStream(stream as ReadableStream<Uint8Array<ArrayBufferLike>>);
  }
}

const parser = new Parser();
