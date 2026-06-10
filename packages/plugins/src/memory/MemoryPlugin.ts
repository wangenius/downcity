/**
 * MemoryPlugin：agent 的长期记忆 plugin。
 *
 * 关键点（中文）
 * - 对外仍然是 MemoryPlugin，内部使用 LLM Wiki 方式组织知识。
 * - constructor 注入 digest/revise 能力，plugin 不绑定具体 LLM 服务。
 * - action 面向 agent 语义，而不是暴露底层文件写入细节。
 */

import type { Command } from "commander";
import type { JsonObject, JsonValue } from "@downcity/agent/internal/types/common/Json.js";
import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
import type { PluginActions } from "@downcity/agent/internal/plugin/types/Plugin.js";
import { BasePlugin } from "@downcity/agent/internal/plugin/core/BasePlugin.js";
import {
  digestMemoryAction,
  readMemoryAction,
  rememberMemoryAction,
  reviseMemoryAction,
  searchMemoryAction,
  statusMemoryAction,
} from "./Action.js";
import {
  createMemoryRuntimeState,
  type MemoryRuntimeState,
} from "./runtime/Store.js";
import { buildMemoryPluginSystemText } from "./runtime/SystemProvider.js";
import { ensureMemoryDirectories } from "./runtime/Writer.js";
import type { MemoryPluginOptions } from "./types/Memory.js";

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
 * Memory plugin 类实现。
 */
export class MemoryPlugin extends BasePlugin {
  /**
   * plugin 名称。
   */
  readonly name = "memory";

  /**
   * 当前实例持有的 memory plugin state。
   */
  public runtimeState: MemoryRuntimeState | null = null;

  /**
   * 创建 MemoryPlugin。
   */
  constructor(private readonly options: MemoryPluginOptions = {}) {
    super();
  }

  /**
   * 当前 plugin 的 system 文本提供器。
   */
  async system(context: AgentContext): Promise<string> {
    return await buildMemoryPluginSystemText(context);
  }

  /**
   * 当前 plugin 生命周期。
   */
  readonly lifecycle = {
    start: async (context: AgentContext): Promise<void> => {
      await ensureMemoryDirectories(context.rootPath);
      this.getOrCreateRuntimeState(context);
    },
    stop: async (): Promise<void> => {
      this.runtimeState = null;
    },
  };

  /**
   * 当前 plugin action 定义表。
   */
  readonly actions: PluginActions = {
    status: {
      command: {
        description: "查看 memory wiki 状态（wiki/source/working）",
        mapInput() {
          return {};
        },
      },
      execute: async (params) => {
        const state = this.getOrCreateRuntimeState(params.context);
        return await statusMemoryAction(params.context, state);
      },
    },
    search: {
      command: {
        description: "检索 memory wiki",
        configure(command: Command) {
          command
            .argument("<query>")
            .option("--max-results <number>", "返回条数上限", parsePositiveInteger)
            .option("--min-score <number>", "最小相关分数", parseNumber)
            .option("--include-sources", "同时检索原始 source 层");
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
          if (opts.includeSources === true) {
            payload.includeSources = true;
          }
          return payload;
        },
      },
      execute: async (params) => {
        const body = readBodyObject(params.payload);
        const state = this.getOrCreateRuntimeState(params.context);
        return await searchMemoryAction(params.context, state, {
          query: readString(body, "query"),
          maxResults: readOptionalNumber(body, "maxResults"),
          minScore: readOptionalNumber(body, "minScore"),
          includeSources: readOptionalBoolean(body, "includeSources"),
        });
      },
    },
    read: {
      command: {
        description: "读取 memory wiki/source 文件片段",
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
      execute: async (params) => {
        const body = readBodyObject(params.payload);
        return await readMemoryAction(params.context, {
          path: readString(body, "path"),
          from: readOptionalNumber(body, "from"),
          lines: readOptionalNumber(body, "lines"),
        });
      },
    },
    remember: {
      command: {
        description: "把事实/偏好/决策记入 memory wiki",
        configure(command: Command) {
          command
            .requiredOption("--content <text>", "需要记住的内容")
            .option("--topic <topic>", "记忆主题")
            .option("--wiki-path <path>", "目标 wiki page 路径")
            .option("--source <source>", "来源说明");
        },
        mapInput({ opts }) {
          const payload: JsonObject = {
            content: String(opts.content || ""),
          };
          if (typeof opts.topic === "string") {
            payload.topic = String(opts.topic).trim();
          }
          if (typeof opts.wikiPath === "string") {
            payload.path = String(opts.wikiPath).trim();
          }
          if (typeof opts.source === "string") {
            payload.source = String(opts.source).trim();
          }
          return payload;
        },
      },
      execute: async (params) => {
        const body = readBodyObject(params.payload);
        return await rememberMemoryAction(params.context, this.options, {
          content: readString(body, "content"),
          topic: readOptionalString(body, "topic"),
          path: readOptionalString(body, "path"),
          source: readOptionalString(body, "source"),
        });
      },
    },
    digest: {
      command: {
        description: "把 session 提炼进 memory wiki",
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
      execute: async (params) => {
        const body = readBodyObject(params.payload);
        return await digestMemoryAction(params.context, this.options, {
          sessionId: readString(body, "sessionId"),
          maxMessages: readOptionalNumber(body, "maxMessages"),
        });
      },
    },
    revise: {
      command: {
        description: "基于新证据修订 memory wiki page",
        configure(command: Command) {
          command
            .argument("<memoryPath>", "目标 wiki page 路径")
            .requiredOption("--instruction <text>", "修订指令")
            .option("--evidence <text>", "新证据");
        },
        mapInput({ args, opts }) {
          const payload: JsonObject = {
            path: String(args[0] || ""),
            instruction: String(opts.instruction || ""),
          };
          if (typeof opts.evidence === "string") {
            payload.evidence = String(opts.evidence).trim();
          }
          return payload;
        },
      },
      execute: async (params) => {
        const body = readBodyObject(params.payload);
        return await reviseMemoryAction(params.context, this.options, {
          path: readString(body, "path"),
          instruction: readString(body, "instruction"),
          evidence: readOptionalString(body, "evidence"),
        });
      },
    },
  };

  /**
   * 获取或创建当前实例绑定的 memory plugin state。
   */
  private getOrCreateRuntimeState(context: AgentContext): MemoryRuntimeState {
    if (!this.runtimeState) {
      this.runtimeState = createMemoryRuntimeState(context);
    }
    return this.runtimeState;
  }
}
