/**
 * Console UI Env 路由。
 *
 * 关键点（中文）
 * - 提供 Console 级与 Agent 级环境变量的统一读写接口。
 * - 所有 value 在 DB 中以密文存储，这里的接口只负责明文读写与删除。
 */

import type { Hono } from "hono";
import { ConsoleStore } from "@/utils/store/index.js";

type EnvScope = "global" | "agent";

function normalizeScope(input: string | undefined): EnvScope {
  const value = String(input || "").trim().toLowerCase();
  if (value === "agent") return "agent";
  return "global";
}

function normalizeNonEmptyText(value: unknown, fieldName: string): string {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`${fieldName} cannot be empty`);
  }
  return text;
}

/**
 * 注册 Env 管理 API 路由。
 */
export function registerConsoleUiEnvRoutes(params: {
  /**
   * Hono 应用实例。
   */
  app: Hono;
}): void {
  const app = params.app;

  app.get("/api/ui/env", async (c) => {
    const scope = normalizeScope(c.req.query("scope"));
    const agentIdRaw = c.req.query("agent");
    const store = new ConsoleStore();
    try {
      if (scope === "agent") {
        const agentId = String(agentIdRaw || "").trim();
        const rows = agentId
          ? await store.listAgentEnvEntries(agentId)
          : await store.listAllAgentEnvEntries();
        return c.json({
          success: true,
          scope,
          agentId: agentId || undefined,
          items: rows.map((item) => ({
            scope: "agent" as const,
            agentId: item.agentId,
            key: item.key,
            value: item.value,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          })),
        });
      }

      const rows = await store.listGlobalEnvEntries();
      return c.json({
        success: true,
        scope: "global",
        items: rows.map((item) => ({
          scope: "global" as const,
          key: item.key,
          value: item.value,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        })),
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    } finally {
      store.close();
    }
  });

  app.post("/api/ui/env/upsert", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        scope?: string;
        agentId?: string;
        key?: string;
        value?: string;
      };
      const scope = normalizeScope(body.scope);
      const key = normalizeNonEmptyText(body.key, "env key");
      const value = String(body.value ?? "");
      const store = new ConsoleStore();
      try {
        if (scope === "agent") {
          const agentId = normalizeNonEmptyText(body.agentId, "agentId");
          await store.upsertAgentEnvEntry({
            agentId,
            key,
            value,
          });
          return c.json({
            success: true,
            scope,
            agentId,
            key,
          });
        }

        await store.upsertGlobalEnvEntry({
          key,
          value,
        });
        return c.json({
          success: true,
          scope: "global",
          key,
        });
      } finally {
        store.close();
      }
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/ui/env/remove", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        scope?: string;
        agentId?: string;
        key?: string;
      };
      const scope = normalizeScope(body.scope);
      const key = normalizeNonEmptyText(body.key, "env key");
      const store = new ConsoleStore();
      try {
        if (scope === "agent") {
          const agentId = normalizeNonEmptyText(body.agentId, "agentId");
          store.removeAgentEnvEntry(agentId, key);
          return c.json({
            success: true,
            scope,
            agentId,
            key,
          });
        }

        store.removeGlobalEnvEntry(key);
        return c.json({
          success: true,
          scope: "global",
          key,
        });
      } finally {
        store.close();
      }
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });
}
