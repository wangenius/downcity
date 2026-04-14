/**
 * `city env` 命令树。
 *
 * 关键点（中文）
 * - `env` 是 Console Env 的资源命令，支持 list/set/delete。
 * - 默认不输出任何 secret value；只在显式 set 时写入值。
 * - global / agent 两层 env 共用统一 store，但 CLI 语义仍保持清晰。
 */

import type { Command } from "commander";
import { ConsoleStore } from "@/shared/utils/store/index.js";
import type { StoredEnvEntry, StoredEnvScope } from "@/shared/types/Store.js";
import { emitCliBlock, emitCliList } from "./CliReporter.js";
import { parseBoolean } from "./IndexSupport.js";

/**
 * env 子命令的 scope 类型。
 */
type KeysScope = StoredEnvScope | "all";

/**
 * 规范化 env scope。
 */
function normalizeKeysScope(value: string | undefined, options?: {
  /**
   * 是否允许 `all`。
   */
  allowAll?: boolean;
}): KeysScope {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "global") return "global";
  if (normalized === "agent") return "agent";
  if (options?.allowAll === true && normalized === "all") return "all";
  throw new Error(`Unsupported scope: ${value}`);
}

/**
 * 规范化 env key。
 */
function normalizeEnvKey(value: string): string {
  const key = String(value || "").trim().toUpperCase();
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
    throw new Error(`Invalid env key: ${value}`);
  }
  return key;
}

/**
 * 规范化非空文本。
 */
function normalizeRequiredText(value: string | undefined, fieldName: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

/**
 * 把 env value 格式化成 `.env` 可解析的值。
 *
 * 关键点（中文）
 * - 简单值保持裸值，便于用户直接阅读。
 * - 包含空白、引号、换行等特殊字符时使用双引号并转义。
 * - 空字符串输出为空值：`KEY=`。
 */
function formatDotenvValue(value: string): string {
  const text = String(value ?? "");
  if (!text) return "";
  if (/^[A-Za-z0-9_./:@+-]+$/.test(text)) {
    return text;
  }
  return `"${text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/"/g, "\\\"")}"`;
}

/**
 * 把 Console Env 条目输出为 dotenv 文件内容。
 */
function formatDotenvEntries(entries: StoredEnvEntry[]): string {
  if (entries.length === 0) return "";
  return `${entries
    .map((item) => `${item.key}=${formatDotenvValue(item.value)}`)
    .join("\n")}\n`;
}

/**
 * 判断当前命令是否处在 agent shell 执行上下文。
 *
 * 关键点（中文）
 * - agent shell 会注入 `DC_AGENT_PATH/DC_AGENT_NAME`，用于嵌套 city CLI 定位当前 agent。
 * - `env copy` 会导出 secret 明文，不能允许 agent 自己调用。
 */
function isAgentShellExecution(): boolean {
  return Boolean(
    String(process.env.DC_AGENT_PATH || "").trim() ||
      String(process.env.DC_AGENT_NAME || "").trim(),
  );
}

/**
 * 限制 `city env copy` 只能由本机 CLI 执行。
 */
function assertEnvCopyAllowedFromLocalCli(): void {
  if (!isAgentShellExecution()) return;
  throw new Error("city env copy can only be run from the local CLI, not from an agent shell.");
}

/**
 * 解析命令输入最终使用的 env scope。
 */
function resolveKeysCommandScope(params: {
  /**
   * 命令行 `--scope` 原始值。
   */
  scope?: string;
  /**
   * 命令行 `--agent` 原始值。
   */
  agentId?: string;
  /**
   * 当前命令是否允许 `all`。
   */
  allowAll?: boolean;
}): {
  /**
   * 最终 env scope。
   */
  scope: KeysScope;
  /**
   * 规范化后的 agentId。
   */
  agentId?: string;
} {
  const agentId = String(params.agentId || "").trim();
  if (agentId) {
    return {
      scope: "agent",
      agentId,
    };
  }

  return {
    scope: normalizeKeysScope(params.scope, {
      allowAll: params.allowAll === true,
    }),
  };
}

/**
 * 读取指定范围的 env 条目。
 */
async function listKeysEntries(params: {
  /**
   * scope 过滤。
   */
  scope: KeysScope;
  /**
   * agent 过滤。
   */
  agentId?: string;
}): Promise<StoredEnvEntry[]> {
  const store = new ConsoleStore();
  try {
    if (params.scope === "all") {
      return await store.listEnvEntries();
    }
    return await store.listEnvEntries(params.scope, params.agentId);
  } finally {
    store.close();
  }
}

/**
 * 输出 env 列表。
 */
async function emitKeysList(params: {
  /**
   * scope 过滤。
   */
  scope: KeysScope;
  /**
   * agent 过滤。
   */
  agentId?: string;
  /**
   * 是否以 JSON 输出。
   */
  asJson?: boolean;
}): Promise<void> {
  const entries = await listKeysEntries({
    scope: params.scope,
    agentId: params.agentId,
  });

  if (params.asJson === true) {
    console.log(JSON.stringify({
      success: true,
      scope: params.scope,
      agentId: params.agentId,
      count: entries.length,
      keys: entries.map((item) => ({
        key: item.key,
        description: item.description || "",
        scope: item.scope,
        ...(item.agentId ? { agentId: item.agentId } : {}),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    }, null, 2));
    return;
  }

  if (entries.length === 0) {
    emitCliBlock({
      tone: "info",
      title: "Env",
      summary: "0 configured",
      note: "No Console Env entry matched the current filter.",
    });
    return;
  }

  emitCliList({
    tone: "accent",
    title: "Env",
    summary: `${entries.length} configured`,
    items: entries.map((item) => ({
      tone: "info",
      title: item.key,
      facts: [
        {
          label: "Scope",
          value: item.scope,
        },
        ...(item.agentId
          ? [
              {
                label: "Agent",
                value: item.agentId,
              },
            ]
          : []),
        ...(item.description
          ? [
              {
                label: "Description",
                value: item.description,
              },
            ]
          : []),
      ],
    })),
  });
}

/**
 * 输出 dotenv 格式的 env 内容。
 */
async function emitDotenvCopy(params: {
  /**
   * scope 过滤。
   */
  scope: KeysScope;
  /**
   * agent 过滤。
   */
  agentId?: string;
}): Promise<void> {
  const entries = await listKeysEntries({
    scope: params.scope,
    agentId: params.agentId,
  });
  process.stdout.write(formatDotenvEntries(entries));
}

/**
 * 写入单个 env 条目。
 */
async function setKeyEntry(params: {
  /**
   * scope。
   */
  scope: StoredEnvScope;
  /**
   * agentId。
   */
  agentId?: string;
  /**
   * env key。
   */
  key: string;
  /**
   * env value。
   */
  value: string;
  /**
   * 描述。
   */
  description?: string;
  /**
   * 是否以 JSON 输出。
   */
  asJson?: boolean;
}): Promise<void> {
  const store = new ConsoleStore();
  try {
    await store.upsertEnvEntry({
      scope: params.scope,
      agentId: params.agentId,
      key: params.key,
      value: params.value,
      description: String(params.description || "").trim(),
    });
  } finally {
    store.close();
  }

  if (params.asJson === true) {
    console.log(JSON.stringify({
      success: true,
      action: "set",
      scope: params.scope,
      agentId: params.agentId,
      key: params.key,
    }, null, 2));
    return;
  }

  emitCliBlock({
    tone: "success",
    title: "Key saved",
    summary: params.key,
    facts: [
      {
        label: "Scope",
        value: params.scope,
      },
      ...(params.agentId
        ? [
            {
              label: "Agent",
              value: params.agentId,
            },
          ]
        : []),
      ...(params.description
        ? [
            {
              label: "Description",
              value: params.description,
            },
          ]
        : []),
    ],
  });
}

/**
 * 删除单个 env 条目。
 */
function deleteKeyEntry(params: {
  /**
   * scope。
   */
  scope: StoredEnvScope;
  /**
   * agentId。
   */
  agentId?: string;
  /**
   * env key。
   */
  key: string;
  /**
   * 是否以 JSON 输出。
   */
  asJson?: boolean;
}): void {
  const store = new ConsoleStore();
  try {
    store.removeEnvEntry({
      scope: params.scope,
      agentId: params.agentId,
      key: params.key,
    });
  } finally {
    store.close();
  }

  if (params.asJson === true) {
    console.log(JSON.stringify({
      success: true,
      action: "delete",
      scope: params.scope,
      agentId: params.agentId,
      key: params.key,
    }, null, 2));
    return;
  }

  emitCliBlock({
    tone: "success",
    title: "Key deleted",
    summary: params.key,
    facts: [
      {
        label: "Scope",
        value: params.scope,
      },
      ...(params.agentId
        ? [
            {
              label: "Agent",
              value: params.agentId,
            },
          ]
        : []),
    ],
  });
}

/**
 * 注册 `city env` 命令组。
 */
export function registerEnvCommand(program: Command): void {
  const env = program
    .command("env")
    .description("管理 Console Env 中的 key")
    .helpOption("--help", "display help for command");

  env
    .command("list")
    .description("列出 Console Env 中已配置的 key")
    .option("--scope <scope>", "按作用域过滤：global|agent|all", "global")
    .option("--agent <agentId>", "仅列出指定 agent 的私有 env（会隐式使用 --scope agent）")
    .option("--json [enabled]", "以 JSON 输出", parseBoolean)
    .helpOption("--help", "display help for command")
    .action(async (options: { scope?: string; agent?: string; json?: boolean }) => {
      const resolved = resolveKeysCommandScope({
        scope: options.scope,
        agentId: options.agent,
        allowAll: true,
      });
      await emitKeysList({
        scope: resolved.scope,
        agentId: resolved.agentId,
        asJson: options.json === true,
      });
    });

  env
    .command("set <key> <value>")
    .description("新增或更新 Console Env 中的 key")
    .option("--scope <scope>", "写入作用域：global|agent", "global")
    .option("--agent <agentId>", "指定 agent 私有 env（会隐式使用 --scope agent）")
    .option("-d, --description <description>", "设置 key 描述")
    .option("--json [enabled]", "以 JSON 输出", parseBoolean)
    .helpOption("--help", "display help for command")
    .action(async (
      keyInput: string,
      valueInput: string,
      options: { scope?: string; agent?: string; description?: string; json?: boolean },
    ) => {
      const resolved = resolveKeysCommandScope({
        scope: options.scope,
        agentId: options.agent,
        allowAll: false,
      });
      if (resolved.scope === "all") {
        throw new Error("env set does not support scope=all");
      }

      await setKeyEntry({
        scope: resolved.scope,
        agentId: resolved.agentId,
        key: normalizeEnvKey(keyInput),
        value: String(valueInput ?? ""),
        description: String(options.description || "").trim(),
        asJson: options.json === true,
      });
    });

  env
    .command("copy")
    .description("按 .env 文件格式输出 Console Env 的明文值")
    .option("--scope <scope>", "按作用域复制：global|agent|all", "global")
    .option("--agent <agentId>", "复制指定 agent 的私有 env（会隐式使用 --scope agent）")
    .helpOption("--help", "display help for command")
    .action(async (options: { scope?: string; agent?: string }) => {
      assertEnvCopyAllowedFromLocalCli();
      const resolved = resolveKeysCommandScope({
        scope: options.scope,
        agentId: options.agent,
        allowAll: true,
      });
      await emitDotenvCopy({
        scope: resolved.scope,
        agentId: resolved.agentId,
      });
    });

  env
    .command("delete <key>")
    .description("删除 Console Env 中的 key")
    .option("--scope <scope>", "删除作用域：global|agent", "global")
    .option("--agent <agentId>", "指定 agent 私有 env（会隐式使用 --scope agent）")
    .option("--json [enabled]", "以 JSON 输出", parseBoolean)
    .helpOption("--help", "display help for command")
    .action(async (
      keyInput: string,
      options: { scope?: string; agent?: string; json?: boolean },
    ) => {
      const resolved = resolveKeysCommandScope({
        scope: options.scope,
        agentId: options.agent,
        allowAll: false,
      });
      if (resolved.scope === "all") {
        throw new Error("env delete does not support scope=all");
      }

      deleteKeyEntry({
        scope: resolved.scope,
        agentId: resolved.agentId,
        key: normalizeEnvKey(keyInput),
        asJson: options.json === true,
      });
    });

  env.action(async () => {
    await emitKeysList({
      scope: "global",
    });
  });

  env.showHelpAfterError();
  env.showSuggestionAfterError();
}
