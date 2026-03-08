import { parseFetchRequestForLog, type ProviderFetch } from "./Format.js";
import type { JsonObject } from "@/types/Json.js";

export type LlmLogContext = {
  contextId?: string;
  requestId?: string;
};

export function createLlmLoggingFetch(args: {
  logger: {
    log(level: string, message: string, data?: JsonObject): Promise<void>;
  };
  enabled: boolean;
  maxChars?: number;
  getRequestContext?: () => LlmLogContext | undefined;
}): ProviderFetch {
  const baseFetch: ProviderFetch = globalThis.fetch.bind(globalThis);
  const maxChars = args.maxChars ?? 99999999;

  return async (input, init) => {
    if (args.enabled) {
      try {
        const ctx = args.getRequestContext?.();
        const parsed = parseFetchRequestForLog(input, init, {
          incrementalKey: ctx?.contextId,
        });

        if (parsed) {
          const contextId = ctx?.contextId;
          const requestId = ctx?.requestId;
          const message = String(parsed.requestText || "").trim();

          await args.logger.log("info", message.slice(0, maxChars), {
            ...parsed.meta,
            ...(contextId ? { contextId } : {}),
            ...(requestId ? { requestId } : {}),
          });
        }
      } catch {
        // ignore
      }
    }

    return baseFetch(input, init);
  };
}
