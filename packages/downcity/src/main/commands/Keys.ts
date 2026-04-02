/**
 * `city keys` 命令。
 *
 * 关键点（中文）
 * - 直接读取 Console UI Env 使用的同一份存储数据（`env_entries`）。
 * - 只输出 key / description / scope / agentId，不输出 value。
 * - 默认列全局 env；可按 scope 或 agent 过滤。
 */

import type { Command } from "commander";
import fs from "node:fs";
import Database from "better-sqlite3";
import { printResult } from "@utils/cli/CliOutput.js";
import { getConsoleShipDbPath } from "@/main/runtime/ConsolePaths.js";

function parseBooleanOption(value: string | undefined): boolean {
  if (value === undefined) return true;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  throw new Error(`Invalid boolean: ${value}`);
}

function normalizeScope(value: string | undefined): "global" | "agent" | "all" {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "global") return "global";
  if (normalized === "agent") return "agent";
  if (normalized === "all") return "all";
  throw new Error(`Unsupported scope: ${value}`);
}

/**
 * 注册 `city keys` 命令。
 */
export function registerKeysCommand(program: Command): void {
  program
    .command("keys")
    .description("列出 Console UI Env 中已配置的环境变量名与描述（不输出值）")
    .option("--scope <scope>", "按作用域过滤：global|agent|all", "global")
    .option("--agent <agentId>", "仅列出指定 agent 的私有 env（会隐式使用 --scope agent）")
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true)
    .helpOption("--help", "display help for command")
    .action(async (options: { scope?: string; agent?: string; json?: boolean }) => {
      const asJson = options.json !== false;
      try {
        const agentId = String(options.agent || "").trim();
        const scope = agentId ? "agent" : normalizeScope(options.scope);
        const dbPath = getConsoleShipDbPath();
        if (!fs.existsSync(dbPath)) {
          throw new Error(`console db not found: ${dbPath}`);
        }
        const db = new Database(dbPath, { readonly: true });
        try {
          const columnRows = db
            .prepare("PRAGMA table_info(env_entries);")
            .all() as Array<{ name?: unknown }>;
          const hasDescription = columnRows.some(
            (row) => String(row.name || "").trim() === "description",
          );
          const selectDescription = hasDescription ? "description," : "'' AS description,";
          const rows =
            agentId
              ? db.prepare(
                  `
                  SELECT scope, agent_id, key, ${selectDescription} created_at, updated_at
                  FROM env_entries
                  WHERE scope = 'agent' AND agent_id = ?
                  ORDER BY key ASC;
                  `,
                ).all(agentId)
              : scope === "agent"
                ? db.prepare(
                    `
                    SELECT scope, agent_id, key, ${selectDescription} created_at, updated_at
                    FROM env_entries
                    WHERE scope = 'agent'
                    ORDER BY agent_id ASC, key ASC;
                    `,
                  ).all()
                : scope === "all"
                  ? db.prepare(
                      `
                      SELECT scope, agent_id, key, ${selectDescription} created_at, updated_at
                      FROM env_entries
                      ORDER BY scope ASC, agent_id ASC, key ASC;
                      `,
                    ).all()
                  : db.prepare(
                      `
                      SELECT scope, agent_id, key, ${selectDescription} created_at, updated_at
                      FROM env_entries
                      WHERE scope = 'global'
                      ORDER BY key ASC;
                      `,
                    ).all();

          printResult({
            asJson,
            success: true,
            title: "environment keys",
          payload: {
            scope,
            agentId: agentId || undefined,
            count: rows.length,
            note:
              "These keys are stored encrypted in the console store. `city keys` only lists configured key names and descriptions, and will never return secret values. Agents should not try to fetch missing plaintext values from this command.",
            keys: rows.map((item) => {
              const normalizedAgentId = String(
                (item as { agent_id?: unknown }).agent_id || "",
              ).trim();
                return {
                  key: String((item as { key?: unknown }).key || ""),
                  description: String((item as { description?: unknown }).description || ""),
                  scope: String((item as { scope?: unknown }).scope || ""),
                  ...(normalizedAgentId ? { agentId: normalizedAgentId } : {}),
                  createdAt: String((item as { created_at?: unknown }).created_at || ""),
                  updatedAt: String((item as { updated_at?: unknown }).updated_at || ""),
                };
              }),
            },
          });
        } finally {
          db.close();
        }
      } catch (error) {
        printResult({
          asJson,
          success: false,
          title: "keys command failed",
          payload: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        process.exitCode = 1;
      }
    });
}
