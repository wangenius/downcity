import {
  parseFetchRequestForLog,
  parseFetchResponseForLog,
  type ProviderFetch,
} from "./Format.js";
import type { JsonObject } from "@/shared/types/Json.js";

export type LlmLogContext = {
  sessionId?: string;
};

export function createLlmLoggingFetch(args: {
  logger: {
    log(level: string, message: string, data?: JsonObject): Promise<void>;
  };
  enabled: boolean;
  maxChars?: number;
  getSessionRunScope?: () => LlmLogContext | undefined;
}): ProviderFetch {
  const baseFetch: ProviderFetch = globalThis.fetch.bind(globalThis);
  const maxChars = args.maxChars ?? 99999999;

  return async (input, init) => {
    const ctx = args.getSessionRunScope?.();
    let parsedRequest:
      | ReturnType<typeof parseFetchRequestForLog>
      | null = null;

    if (args.enabled) {
      try {
        parsedRequest = parseFetchRequestForLog(input, init, {
          incrementalKey: ctx?.sessionId,
        });

        if (parsedRequest) {
          const sessionId = ctx?.sessionId;
          const message = String(parsedRequest.requestText || "").trim();

          await args.logger.log("info", message.slice(0, maxChars), {
            ...parsedRequest.meta,
            ...(sessionId ? { sessionId } : {}),
          });
        }
      } catch {
        // ignore
      }
    }

    let response: Response;
    try {
      response = await baseFetch(input, init);
    } catch (error) {
      if (args.enabled) {
        try {
          await args.logger.log("error", "[agent] llm.fetch.error", {
            kind: "llm_fetch_error",
            error: String(error || "unknown_error"),
            ...(parsedRequest?.url ? { url: parsedRequest.url } : {}),
            ...(parsedRequest?.method ? { method: parsedRequest.method } : {}),
            ...(ctx?.sessionId ? { sessionId: ctx.sessionId } : {}),
          });
        } catch {
          // ignore
        }
      }
      throw error;
    }

    if (args.enabled) {
      const responseClone = response.clone();
      void (async () => {
        try {
          const parsedResponse = await parseFetchResponseForLog(responseClone, {
            url: parsedRequest?.url,
            method: parsedRequest?.method,
          });
          await args.logger.log(
            "info",
            String(parsedResponse.responseText || "").slice(0, maxChars),
            {
              ...parsedResponse.meta,
              ...(ctx?.sessionId ? { sessionId: ctx.sessionId } : {}),
            },
          );
        } catch {
          // ignore
        }
      })();
    }

    return response;
  };
}
