/**
 * Memory Service（V2）。
 *
 * 关键点（中文）
 * - 正式注册为 service，提供统一 action 面。
 * - 默认启用，支持 `context.memory.enabled=false` 关闭。
 */

import type { Command } from "commander";
import type { Service } from "@agent/service/ServiceManager.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import {
  flushMemoryAction,
  getMemoryAction,
  indexMemoryAction,
  searchMemoryAction,
  statusMemoryAction,
  storeMemoryAction,
} from "./Action.js";
import { startMemoryRuntime, stopMemoryRuntime } from "./runtime/Store.js";
import { buildMemoryServiceSystemText } from "./runtime/SystemProvider.js";
import { ensureMemoryDirectories } from "./runtime/Writer.js";

function parsePositiveInteger(value: string): number {
  const text = String(value || "").trim();
  if (!/^\d+$/.test(text)) {
    throw new Error(`Invalid positive integer: ${value}`);
  }
  const num = Number(text);
  if (!Number.isFinite(num) || num < 1) {
    throw new Error(`Invalid positive integer: ${value}`);
  }
  return num;
}

function parseNumber(value: string): number {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error("number is required");
  }
  const num = Number(text);
  if (!Number.isFinite(num)) {
    throw new Error(`Invalid number: ${value}`);
  }
  return num;
}

function readBodyObject(rawBody: JsonValue): JsonObject {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return {};
  }
  return rawBody as JsonObject;
}

function readString(body: JsonObject, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

function readOptionalString(body: JsonObject, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" ? value : undefined;
}

function readOptionalNumber(body: JsonObject, key: string): number | undefined {
  const value = body[key];
  return typeof value === "number" ? value : undefined;
}

function readOptionalBoolean(body: JsonObject, key: string): boolean | undefined {
  const value = body[key];
  return typeof value === "boolean" ? value : undefined;
}

export const memoryService: Service = {
  name: "memory",
  async system(context) {
    return await buildMemoryServiceSystemText(context);
  },
  lifecycle: {
    async start(context) {
      await ensureMemoryDirectories(context.rootPath);
      await startMemoryRuntime(context);
    },
    async stop(context) {
      await stopMemoryRuntime(context);
    },
  },
  actions: {
    status: {
      command: {
        description: "查看 memory 状态（backend/files/chunks/dirty）",
        mapInput() {
          return {};
        },
      },
      api: {
        method: "GET",
      },
      async execute(params) {
        return await statusMemoryAction(params.context);
      },
    },
    index: {
      command: {
        description: "重建 memory 索引",
        configure(command: Command) {
          command.option("--force", "强制全量重建", false);
        },
        mapInput({ opts }) {
          return {
            force: opts.force === true,
          };
        },
      },
      api: {
        method: "POST",
        mapInput(ctx) {
          return ctx.req.json();
        },
      },
      async execute(params) {
        const body = readBodyObject(params.payload);
        return await indexMemoryAction(params.context, {
          force: readOptionalBoolean(body, "force"),
        });
      },
    },
    search: {
      command: {
        description: "检索记忆片段",
        configure(command: Command) {
          command
            .argument("<query>")
            .option("--max-results <number>", "返回条数上限", parsePositiveInteger)
            .option("--min-score <number>", "最小相关分数", parseNumber);
        },
        mapInput({ args, opts }) {
          const payload: JsonObject = {
            query: String(args[0] || ""),
          };
          if (typeof opts.maxResults === "number") {
            payload.maxResults = opts.maxResults;
          }
          if (typeof opts.minScore === "number") {
            payload.minScore = opts.minScore;
          }
          return payload;
        },
      },
      api: {
        method: "POST",
        mapInput(ctx) {
          return ctx.req.json();
        },
      },
      async execute(params) {
        const body = readBodyObject(params.payload);
        return await searchMemoryAction(params.context, {
          query: readString(body, "query"),
          maxResults: readOptionalNumber(body, "maxResults"),
          minScore: readOptionalNumber(body, "minScore"),
        });
      },
    },
    get: {
      command: {
        description: "读取记忆文件片段",
        configure(command: Command) {
          command
            .argument("<memoryPath>", "记忆文件路径（相对项目根目录）")
            .option("--from <number>", "起始行（1-based）", parsePositiveInteger)
            .option("--lines <number>", "读取行数", parsePositiveInteger);
        },
        mapInput({ args, opts }) {
          const payload: JsonObject = {
            path: String(args[0] || ""),
          };
          if (typeof opts.from === "number") {
            payload.from = opts.from;
          }
          if (typeof opts.lines === "number") {
            payload.lines = opts.lines;
          }
          return payload;
        },
      },
      api: {
        method: "POST",
        mapInput(ctx) {
          return ctx.req.json();
        },
      },
      async execute(params) {
        const body = readBodyObject(params.payload);
        return await getMemoryAction(params.context, {
          path: readString(body, "path"),
          from: readOptionalNumber(body, "from"),
          lines: readOptionalNumber(body, "lines"),
        });
      },
    },
    store: {
      command: {
        description: "显式写入 memory（longterm/daily/working）",
        configure(command: Command) {
          command
            .requiredOption("--content <text>", "写入内容")
            .option("--target <target>", "写入层（longterm|daily|working）")
            .option("--context-id <contextId>", "working 目标必填");
        },
        mapInput({ opts }) {
          const payload: JsonObject = {
            content: String(opts.content || ""),
          };
          if (typeof opts.target === "string") {
            payload.target = String(opts.target).trim();
          }
          if (typeof opts.contextId === "string") {
            payload.contextId = String(opts.contextId).trim();
          }
          return payload;
        },
      },
      api: {
        method: "POST",
        mapInput(ctx) {
          return ctx.req.json();
        },
      },
      async execute(params) {
        const body = readBodyObject(params.payload);
        const target = readOptionalString(body, "target");
        return await storeMemoryAction(params.context, {
          content: readString(body, "content"),
          target:
            target === "longterm" || target === "daily" || target === "working"
              ? target
              : undefined,
          contextId: readOptionalString(body, "contextId"),
        });
      },
    },
    flush: {
      command: {
        description: "将当前会话最近消息刷写到 daily memory",
        configure(command: Command) {
          command
            .requiredOption("--context-id <contextId>", "会话 ID")
            .option("--max-messages <number>", "提取消息窗口", parsePositiveInteger);
        },
        mapInput({ opts }) {
          const payload: JsonObject = {
            contextId: String(opts.contextId || ""),
          };
          if (typeof opts.maxMessages === "number") {
            payload.maxMessages = opts.maxMessages;
          }
          return payload;
        },
      },
      api: {
        method: "POST",
        mapInput(ctx) {
          return ctx.req.json();
        },
      },
      async execute(params) {
        const body = readBodyObject(params.payload);
        return await flushMemoryAction(params.context, {
          contextId: readString(body, "contextId"),
          maxMessages: readOptionalNumber(body, "maxMessages"),
        });
      },
    },
  },
};
