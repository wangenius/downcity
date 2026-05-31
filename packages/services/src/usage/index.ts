/**
 * Downcity 官方 Usage 服务。
 *
 * 通过全局 hook 记录 service 调用事件。
 * 兼容 Node.js 和 Cloudflare Workers（使用 Web Crypto API）。
 */

import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { ServiceDefinition, Context } from "@downcity/city";

export interface UsageServiceOptions {
  /**
   * 是否记录失败的用户侧 service 调用。
   *
   * 默认只记录成功调用；开启后会通过 error hook 记录失败事件。
   */
  record_errors?: boolean;
}

/** Usage 事件表 */
export const usageEvents = sqliteTable("service_usage_events", {
  event_id: text("event_id").primaryKey(),
  town_id: text("town_id").notNull(),
  user_id: text("user_id").notNull(),
  service: text("service").notNull(),
  model_id: text("model_id").notNull(),
  status: text("status").notNull(),
  metadata_json: text("metadata_json").notNull(),
  created_at: text("created_at").notNull(),
});

export function usageService(options: UsageServiceOptions = {}): ServiceDefinition {
  return {
    id: "usage",
    name: "Usage",
    version: "0.1.0",
    schema: { events: usageEvents },
    instruction: [
      "通过全局 hook 记录真实用户侧 service 调用事件。",
      "默认只记录成功调用；record_errors=true 时也会记录失败调用。",
      "常用读取方式是管理端查看 events/summary，用户侧查看 me。",
    ].join("\n"),
    install(ctx) {
      const events = ctx.table<UsageEventRow>("events");

      ctx.hook.after(async (serviceCtx) => {
        if (!shouldRecordUsage(serviceCtx)) return;
        await events.insert(createUsageEvent(serviceCtx, "success"));
      });

      if (options.record_errors) {
        ctx.hook.onError(async (serviceCtx) => {
          if (!shouldRecordUsage(serviceCtx)) return;
          await events.insert(createUsageEvent(serviceCtx, "error"));
        });
      }

      ctx.route({
        method: "GET",
        path: "/events",
        auth: ["admin"],
        async handler(requestCtx) {
          return requestCtx.jsonResponse({ items: await events.select() });
        },
      });

      ctx.route({
        method: "GET",
        path: "/summary",
        auth: ["admin"],
        async handler(requestCtx) {
          return requestCtx.jsonResponse({
            items: summarizeUsage(await events.select()),
          });
        },
      });

      ctx.route({
        method: "GET",
        path: "/me",
        auth: ["user"],
        async handler(requestCtx) {
          return requestCtx.jsonResponse({
            items: await events.select({
              user_id: requestCtx.user?.user_id ?? "",
              town_id: requestCtx.town?.town_id ?? "",
            }),
          });
        },
      });
    },
  };
}

/**
 * 只记录真实用户侧调用。
 *
 * 管理端操作没有 user/town 上下文，usage 服务自己的查询也不应反过来
 * 产生 usage 事件，否则统计接口会污染自身结果。
 */
function shouldRecordUsage(ctx: Context): boolean {
  return Boolean(ctx.user?.user_id && ctx.town?.town_id && ctx.service?.id !== "usage");
}

interface UsageEventRow extends Record<string, unknown> {
  event_id: string; town_id: string; user_id: string;
  service: string; model_id: string; status: string;
  metadata_json: string; created_at: string;
}

function createUsageEvent(ctx: Context, status: "success" | "error"): UsageEventRow {
  return {
    event_id: `usage_${randomId()}`,
    town_id: ctx.town?.town_id ?? "",
    user_id: ctx.user?.user_id ?? "",
    service: ctx.service?.id ?? "",
    model_id: ctx.variant?.id ?? "",
    status,
    metadata_json: JSON.stringify({
      variant: ctx.variant?.id,
      started_at: ctx.started_at?.toISOString(),
      ended_at: ctx.ended_at?.toISOString(),
      error: ctx.error?.message,
    }),
    created_at: new Date().toISOString(),
  };
}

function summarizeUsage(rows: UsageEventRow[]) {
  const byKey = new Map<string, { town_id: string; service: string; status: string; count: number }>();
  for (const row of rows) {
    const key = `${row.town_id}\u0000${row.service}\u0000${row.status}`;
    const current = byKey.get(key) ?? { town_id: row.town_id, service: row.service, status: row.status, count: 0 };
    current.count += 1;
    byKey.set(key, current);
  }
  return [...byKey.values()].sort((a, b) =>
    `${a.town_id}:${a.service}:${a.status}`.localeCompare(`${b.town_id}:${b.service}:${b.status}`),
  );
}

/** 生成随机 ID（兼容 Node 和 Workers） */
function randomId(): string {
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
