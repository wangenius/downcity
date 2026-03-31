/**
 * MemoryService：memory service 的类实现。
 *
 * 关键点（中文）
 * - memory service state 现在归属于 service 实例。
 * - agent 持有 MemoryService 实例，从而天然形成 per-agent 状态边界。
 * - 运行态只在实例内部缓存，不再放到模块级 Map。
 */

import type { Command } from "commander";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import type { ExecutionContext } from "@/types/ExecutionContext.js";
import type { ServiceActions } from "@/types/Service.js";
import { BaseService } from "@services/BaseService.js";
import {
  flushMemoryAction,
  getMemoryAction,
  indexMemoryAction,
  searchMemoryAction,
  statusMemoryAction,
  storeMemoryAction,
} from "./Action.js";
import {
  createMemoryRuntimeState,
  isMemoryEnabled,
  startMemoryRuntime,
  stopMemoryRuntime,
  type MemoryRuntimeState,
} from "./runtime/Store.js";
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

/**
 * Memory service 类实现。
 */
export class MemoryService extends BaseService {
  /**
   * service 名称。
   */
  readonly name = "memory";

  /**
   * 当前实例持有的 memory service state。
   */
  public runtimeState: MemoryRuntimeState | null = null;

  /**
   * 当前 service 的 system 文本提供器。
   */
  async system(context: ExecutionContext): Promise<string> {
    return await buildMemoryServiceSystemText(context);
  }

  /**
   * 当前 service 生命周期。
   */
  readonly lifecycle = {
    start: async (context: ExecutionContext): Promise<void> => {
      await ensureMemoryDirectories(context.rootPath);
      const state = this.getOrCreateRuntimeState(context);
      await startMemoryRuntime(context, state);
    },
    stop: async (): Promise<void> => {
      if (!this.runtimeState) return;
      await stopMemoryRuntime(this.runtimeState);
      this.runtimeState = null;
    },
  };

  /**
   * 当前 service action 定义表。
   */
  readonly actions: ServiceActions = {
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
      execute: async (params) => {
        const state = this.getOrCreateRuntimeState(params.context);
        return await statusMemoryAction(params.context, state);
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
      execute: async (params) => {
        const body = readBodyObject(params.payload);
        const state = this.getOrCreateRuntimeState(params.context);
        return await indexMemoryAction(params.context, state, {
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
      execute: async (params) => {
        const body = readBodyObject(params.payload);
        const state = this.getOrCreateRuntimeState(params.context);
        return await searchMemoryAction(params.context, state, {
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
      execute: async (params) => {
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
            .option("--session-id <sessionId>", "working 目标必填");
        },
        mapInput({ opts }) {
          const payload: JsonObject = {
            content: String(opts.content || ""),
          };
          if (typeof opts.target === "string") {
            payload.target = String(opts.target).trim();
          }
          if (typeof opts.sessionId === "string") {
            payload.sessionId = String(opts.sessionId).trim();
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
      execute: async (params) => {
        const body = readBodyObject(params.payload);
        const target = readOptionalString(body, "target");
        const state = this.getOrCreateRuntimeState(params.context);
        return await storeMemoryAction(params.context, state, {
          content: readString(body, "content"),
          target:
            target === "longterm" || target === "daily" || target === "working"
              ? target
              : undefined,
          sessionId: readOptionalString(body, "sessionId"),
        });
      },
    },
    flush: {
      command: {
        description: "将当前会话最近消息刷写到 daily memory",
        configure(command: Command) {
          command
            .requiredOption("--session-id <sessionId>", "会话 ID")
            .option("--max-messages <number>", "提取消息窗口", parsePositiveInteger);
        },
        mapInput({ opts }) {
          const payload: JsonObject = {
            sessionId: String(opts.sessionId || ""),
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
      execute: async (params) => {
        const body = readBodyObject(params.payload);
        const state = this.getOrCreateRuntimeState(params.context);
        return await flushMemoryAction(params.context, state, {
          sessionId: readString(body, "sessionId"),
          maxMessages: readOptionalNumber(body, "maxMessages"),
        });
      },
    },
  };

  /**
   * 获取或创建当前实例绑定的 memory service state。
   */
  private getOrCreateRuntimeState(context: ExecutionContext): MemoryRuntimeState {
    if (!this.runtimeState) {
      this.runtimeState = createMemoryRuntimeState(context);
      return this.runtimeState;
    }
    this.runtimeState.enabled = isMemoryEnabled(context);
    return this.runtimeState;
  }
}
