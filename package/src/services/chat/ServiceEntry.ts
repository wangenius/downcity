/**
 * Chat service。
 *
 * 关键点（中文）
 * - 使用统一 actions 模型声明 CLI/API/执行逻辑
 * - API 默认路由为 `/service/chat/<action>`
 * - 业务逻辑下沉到 `services/chat/Service.ts`
 */

import path from "node:path";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import type { Command } from "commander";
import {
  resolveChatContextSnapshot,
  resolveChatKey,
  sendChatTextByChatKey,
} from "./Service.js";
import { pickLastSuccessfulChatSendText } from "./runtime/UserVisibleText.js";
import { createTelegramBot } from "./adapters/telegram/Bot.js";
import { createFeishuBot } from "./adapters/feishu/Feishu.js";
import { createQQBot } from "./adapters/qq/QQ.js";
import type {
  Service,
  ServiceActionCommandInput,
} from "@main/service/ServiceRegistry.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import type { ServiceRuntime } from "@/main/service/ServiceRuntime.js";
import type { ContextMessageV1 } from "@core/types/ContextMessage.js";
import type { TelegramBot } from "./adapters/telegram/Bot.js";
import type { FeishuBot } from "./adapters/feishu/Feishu.js";
import type { QQBot } from "./adapters/qq/QQ.js";

type ChatAdapterState = {
  telegram: TelegramBot | null;
  feishu: FeishuBot | null;
  qq: QQBot | null;
};

type ChatSendActionPayload = {
  text: string;
  chatKey?: string;
};

type ChatContextActionPayload = {
  chatKey?: string;
  contextId?: string;
};

type ChatExtractTextPayload = {
  assistantMessage?: JsonObject | null;
};

const CHAT_PROMPT_FILE_URL = new URL("./PROMPT.txt", import.meta.url);
const TELEGRAM_PROMPT_FILE_URL = new URL(
  "./adapters/telegram/PROMPT.txt",
  import.meta.url,
);
const FEISHU_PROMPT_FILE_URL = new URL(
  "./adapters/feishu/PROMPT.txt",
  import.meta.url,
);
const QQ_PROMPT_FILE_URL = new URL("./adapters/qq/PROMPT.txt", import.meta.url);

/**
 * 加载 chat service 使用说明提示词。
 *
 * 关键点（中文）
 * - 启动阶段即加载，缺失时直接抛错，避免静默失效。
 */
function loadChatServicePrompt(): string {
  try {
    return readFileSync(CHAT_PROMPT_FILE_URL, "utf-8").trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `failed to load chat service prompt from ${CHAT_PROMPT_FILE_URL.pathname}: ${reason}`,
    );
  }
}

const CHAT_SERVICE_PROMPT = loadChatServicePrompt();

/**
 * 加载单个 adapter 提示词。
 *
 * 关键点（中文）
 * - adapter 提示词属于强依赖资产，缺失时直接抛错，避免运行时悄悄丢失规则。
 */
function loadChatAdapterPrompt(fileUrl: URL, adapterName: string): string {
  try {
    return readFileSync(fileUrl, "utf-8").trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `failed to load ${adapterName} chat adapter prompt from ${fileUrl.pathname}: ${reason}`,
    );
  }
}

const CHAT_ADAPTER_PROMPTS: Record<"telegram" | "feishu" | "qq", string> = {
  telegram: loadChatAdapterPrompt(TELEGRAM_PROMPT_FILE_URL, "telegram"),
  feishu: loadChatAdapterPrompt(FEISHU_PROMPT_FILE_URL, "feishu"),
  qq: loadChatAdapterPrompt(QQ_PROMPT_FILE_URL, "qq"),
};

/**
 * 构建当前启用 adapter 的提示词片段。
 *
 * 关键点（中文）
 * - 仅注入已启用 adapter，避免给模型引入未接入平台的噪音规则。
 */
function buildEnabledAdapterPrompts(context: ServiceRuntime): string[] {
  const prompts: string[] = [];
  const adapters = context.config.services?.chat?.adapters || {};
  if (adapters.telegram?.enabled) {
    prompts.push(CHAT_ADAPTER_PROMPTS.telegram);
  }
  if (adapters.feishu?.enabled) {
    prompts.push(CHAT_ADAPTER_PROMPTS.feishu);
  }
  if (adapters.qq?.enabled) {
    prompts.push(CHAT_ADAPTER_PROMPTS.qq);
  }
  return prompts;
}

let adapterState: ChatAdapterState = {
  telegram: null,
  feishu: null,
  qq: null,
};

function resetAdapterState(): void {
  adapterState = {
    telegram: null,
    feishu: null,
    qq: null,
  };
}

// 占位符判定（中文）：init 生成的模板值 `${...}` 不应被当作真实密钥。
function isPlaceholder(value?: string): boolean {
  return value === "${}";
}

async function startChatAdapters(context: ServiceRuntime): Promise<void> {
  if (adapterState.telegram || adapterState.feishu || adapterState.qq) {
    await stopChatAdapters();
  }
  const adapters = context.config.services?.chat?.adapters || {};

  if (adapters.telegram?.enabled) {
    context.logger.info("Telegram adapter enabled");
    adapterState.telegram = createTelegramBot(adapters.telegram, context);
    if (adapterState.telegram) {
      await adapterState.telegram.start();
    }
  }

  if (adapters.feishu?.enabled) {
    context.logger.info("Feishu adapter enabled");
    const feishuAdapter = adapters.feishu as typeof adapters.feishu & {
      adminUserIds?: string[];
    };
    const feishuConfig = {
      enabled: true,
      appId:
        (adapters.feishu?.appId && !isPlaceholder(adapters.feishu.appId)
          ? adapters.feishu.appId
          : undefined) ||
        process.env.FEISHU_APP_ID ||
        "",
      appSecret:
        (adapters.feishu?.appSecret && !isPlaceholder(adapters.feishu.appSecret)
          ? adapters.feishu.appSecret
          : undefined) ||
        process.env.FEISHU_APP_SECRET ||
        "",
      domain: feishuAdapter?.domain || "https://open.feishu.cn",
      adminUserIds: Array.isArray(feishuAdapter?.adminUserIds)
        ? feishuAdapter.adminUserIds
        : undefined,
    };
    adapterState.feishu = await createFeishuBot(feishuConfig, context);
    if (adapterState.feishu) {
      await adapterState.feishu.start();
    }
  }

  if (adapters.qq?.enabled) {
    context.logger.info("QQ adapter enabled");
    const envQqGroupAccess = (process.env.QQ_GROUP_ACCESS || "")
      .trim()
      .toLowerCase();
    const qqGroupAccess: "initiator_or_admin" | "anyone" | undefined =
      adapters.qq?.groupAccess === "anyone"
        ? "anyone"
        : adapters.qq?.groupAccess === "initiator_or_admin"
          ? "initiator_or_admin"
          : envQqGroupAccess === "initiator_or_admin"
            ? "initiator_or_admin"
            : "anyone";
    const qqConfig = {
      enabled: true,
      appId:
        (adapters.qq?.appId && !isPlaceholder(adapters.qq.appId)
          ? adapters.qq.appId
          : undefined) ||
        process.env.QQ_APP_ID ||
        "",
      appSecret:
        (adapters.qq?.appSecret && !isPlaceholder(adapters.qq.appSecret)
          ? adapters.qq.appSecret
          : undefined) ||
        process.env.QQ_APP_SECRET ||
        "",
      sandbox:
        typeof adapters.qq?.sandbox === "boolean"
          ? adapters.qq.sandbox
          : (process.env.QQ_SANDBOX || "").toLowerCase() === "true",
      groupAccess: qqGroupAccess,
    };
    adapterState.qq = await createQQBot(qqConfig, context);
    if (adapterState.qq) {
      await adapterState.qq.start();
    }
  }
}

async function stopChatAdapters(): Promise<void> {
  const current = adapterState;
  resetAdapterState();

  if (current.telegram) {
    await current.telegram.stop();
  }
  if (current.feishu) {
    await current.feishu.stop();
  }
  if (current.qq) {
    await current.qq.stop();
  }
}

function getStringOpt(opts: Record<string, JsonValue>, key: string): string {
  return typeof opts[key] === "string" ? String(opts[key]).trim() : "";
}

function getBooleanOpt(opts: Record<string, JsonValue>, key: string): boolean {
  return opts[key] === true;
}

/**
 * 解析 `chat send` 的命令输入。
 *
 * 关键点（中文）
 * - `--text / --stdin / --text-file` 三选一
 * - 文本读取失败直接抛错，由上层统一输出
 */
async function mapChatSendCommandInput(
  input: ServiceActionCommandInput,
): Promise<ChatSendActionPayload> {
  const explicitText = getStringOpt(input.opts, "text");
  const useStdin = getBooleanOpt(input.opts, "stdin");
  const textFile = getStringOpt(input.opts, "textFile");
  const inputSourcesCount =
    (explicitText ? 1 : 0) + (useStdin ? 1 : 0) + (textFile ? 1 : 0);

  if (inputSourcesCount !== 1) {
    throw new Error(
      "Exactly one text source is required: use one of --text, --stdin, or --text-file.",
    );
  }

  let text = explicitText;
  if (useStdin) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    text = Buffer.concat(chunks).toString("utf8");
  } else if (textFile) {
    const filePath = path.resolve(process.cwd(), textFile);
    text = await fs.readFile(filePath, "utf8");
  }

  const chatKey = resolveChatKey({
    chatKey: getStringOpt(input.opts, "chatKey"),
  });
  if (!chatKey) {
    throw new Error(
      "Missing chatKey. Provide --chat-key or ensure SMA_CTX_CHAT_KEY is injected in current shell context.",
    );
  }

  return {
    text,
    chatKey,
  };
}

function mapChatSendApiInput(body: JsonValue): ChatSendActionPayload {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid JSON body");
  }
  const payload = body as JsonObject;
  return {
    text: String(payload.text ?? ""),
    chatKey:
      typeof payload.chatKey === "string" ? payload.chatKey.trim() : undefined,
  };
}

async function executeChatSendAction(params: {
  context: ServiceRuntime;
  payload: ChatSendActionPayload;
}) {
  const chatKey = resolveChatKey({
    chatKey: params.payload.chatKey,
    context: params.context,
  });
  if (!chatKey) {
    return {
      success: false,
      error: "Missing chatKey",
    };
  }

  const result = await sendChatTextByChatKey({
    context: params.context,
    chatKey,
    text: String(params.payload.text || ""),
  });
  if (!result.success) {
    return {
      success: false,
      error: result.error || "chat send failed",
    };
  }
  return {
    success: true,
    data: {
      chatKey: result.chatKey || chatKey,
    },
  };
}

export const chatService: Service = {
  name: "chat",
  system: (context) =>
    [CHAT_SERVICE_PROMPT, ...buildEnabledAdapterPrompts(context)]
      .filter(Boolean)
      .join("\n\n"),
  actions: {
    send: {
      command: {
        description: "发送消息到目标 chatKey",
        configure(command: Command) {
          command
            .option("--text <text>", "消息正文")
            .option("--stdin", "从标准输入读取消息正文", false)
            .option("--text-file <file>", "从文件读取消息正文（相对当前目录）")
            .option(
              "--chat-key <chatKey>",
              "目标 chatKey（不传则尝试读取 SMA_CTX_CHAT_KEY）",
            );
        },
        mapInput: mapChatSendCommandInput,
      },
      api: {
        method: "POST",
        async mapInput(c) {
          return mapChatSendApiInput(await c.req.json());
        },
      },
      async execute(params) {
        return executeChatSendAction({
          context: params.context,
          payload: params.payload as ChatSendActionPayload,
        });
      },
    },
    context: {
      command: {
        description: "查看当前会话上下文快照",
        configure(command: Command) {
          command.option("--chat-key <chatKey>", "显式覆盖 chatKey");
        },
        mapInput(input) {
          const chatKey = getStringOpt(input.opts, "chatKey");
          return {
            ...(chatKey ? { chatKey } : {}),
          };
        },
      },
      api: {
        method: "GET",
        mapInput(c) {
          const chatKey = String(c.req.query("chatKey") || "").trim();
          const contextId = String(c.req.query("contextId") || "").trim();
          return {
            ...(chatKey ? { chatKey } : {}),
            ...(contextId ? { contextId } : {}),
          };
        },
      },
      async execute(params) {
        const payload = params.payload as ChatContextActionPayload;
        const snapshot = resolveChatContextSnapshot({
          context: params.context,
          ...(payload.chatKey ? { chatKey: payload.chatKey } : {}),
          ...(payload.contextId ? { contextId: payload.contextId } : {}),
        });
        return {
          success: true,
          data: {
            context: snapshot,
          },
        };
      },
    },
    extract_text: {
      async execute(params) {
        const payload = params.payload as ChatExtractTextPayload;
        return {
          success: true,
          data: {
            text: pickLastSuccessfulChatSendText(
              (payload.assistantMessage || null) as ContextMessageV1 | null,
            ),
          },
        };
      },
    },
  },
  lifecycle: {
    async start(context) {
      await startChatAdapters(context);
    },
    async stop() {
      await stopChatAdapters();
    },
  },
};
