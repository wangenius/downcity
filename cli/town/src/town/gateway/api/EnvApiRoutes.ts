/**
 * 平台环境变量管理路由。
 *
 * 关键点（中文）
 * - 当前只提供平台全局 env 的统一读写接口。
 * - 所有 value 在 DB 中以密文存储，这里的接口只负责明文读写与删除。
 */

import dotenv from "dotenv";
import type { Hono } from "hono";
import { PlatformStore } from "@/town/store/index.js";

function normalizeNonEmptyText(value: unknown, fieldName: string): string {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`${fieldName} cannot be empty`);
  }
  return text;
}

function normalizeEnvKey(value: unknown): string {
  const key = String(value || "").trim().toUpperCase();
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
    throw new Error(`invalid env key: ${String(value || "")}`);
  }
  return key;
}

function parseDotenvEntries(raw: unknown): Array<{ key: string; value: string }> {
  const text = String(raw || "").replace(/^\uFEFF/, "").trim();
  if (!text) {
    throw new Error("clipboard env text cannot be empty");
  }

  /**
   * 关键点（中文）
   * - 兼容用户直接复制 `export KEY=value` 形式。
   * - 仍然复用 `dotenv.parse`，保持 `.env` 解析行为一致。
   */
  const normalized = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^(\s*)export\s+/, "$1"))
    .join("\n");
  const parsed = dotenv.parse(normalized);
  const entries = Object.entries(parsed).map(([key, value]) => ({
    key: normalizeEnvKey(key),
    value: String(value ?? ""),
  }));

  if (entries.length === 0) {
    throw new Error("clipboard does not contain valid .env entries");
  }

  return entries;
}

/**
 * 注册 Env 管理 API 路由。
 */
export function registerPlatformEnvRoutes(params: {
  /**
   * Hono 应用实例。
   */
  app: Hono;
}): void {
  const app = params.app;

  app.get("/api/ui/env", async (c) => {
    const store = new PlatformStore();
    try {
      const rows = await store.listEnvEntries();
      return c.json({
        success: true,
        scope: "global",
        items: rows.map((item) => ({
          scope: "global" as const,
          key: item.key,
          description: item.description,
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
        key?: string;
        description?: string;
        value?: string;
      };
      const key = normalizeNonEmptyText(body.key, "env key");
      const description = String(body.description || "").trim();
      const value = String(body.value ?? "");
      const store = new PlatformStore();
      try {
        await store.upsertEnvEntry({
          scope: "global",
          key,
          description,
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
        key?: string;
      };
      const key = normalizeNonEmptyText(body.key, "env key");
      const store = new PlatformStore();
      try {
        store.removeEnvEntry(key);
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

  app.post("/api/ui/env/import", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        raw?: string;
      };
      const entries = parseDotenvEntries(body.raw);
      const store = new PlatformStore();
      try {
        for (const entry of entries) {
          await store.upsertEnvEntry({
            scope: "global",
            key: entry.key,
            description: "",
            value: entry.value,
          });
        }
        return c.json({
          success: true,
          scope: "global",
          count: entries.length,
          keys: entries.map((entry) => entry.key),
        });
      } finally {
        store.close();
      }
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });
}
