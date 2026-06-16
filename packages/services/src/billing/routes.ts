/**
 * Billing 服务 HTTP 路由装配模块。
 *
 * 关键说明（中文）
 * - 管理端维护 pricing rule 和查看全量 charge
 * - 用户侧只查看自己的 charge
 */

import type { ServiceInstallContext, ServiceRouteContext } from "@downcity/city";
import type { BillingService } from "./service.ts";
import type { BillingChargeQuery, BillingPricingRuleInput } from "./types.ts";

/**
 * 注册 Billing 服务 HTTP 路由。
 */
export function registerBillingRoutes(service: BillingService, ctx: ServiceInstallContext): void {
  ctx.route({
    method: "GET",
    path: "/pricing",
    auth: ["admin"],
    handler: async (c) => {
      const input = await c.json<{ limit?: string | number }>();
      return c.jsonResponse({ items: await service.listPricingRules(input) });
    },
  });

  ctx.route({
    method: "POST",
    path: "/pricing/upsert",
    auth: ["admin"],
    handler: async (c) => c.jsonResponse(await service.upsertPricingRule(await c.json<BillingPricingRuleInput>())),
  });

  ctx.route({
    method: "GET",
    path: "/charges",
    auth: ["admin"],
    handler: async (c) => {
      const input = await c.json<BillingChargeQuery>();
      return c.jsonResponse({ items: await service.listCharges(input) });
    },
  });

  ctx.route({
    method: "GET",
    path: "/me",
    auth: ["user"],
    handler: async (c) => {
      const input = await c.json<BillingChargeQuery>();
      return c.jsonResponse({
        items: await service.listCharges({
          ...input,
          user_id: readUserId(c),
          town_id: c.town?.town_id,
        }),
      });
    },
  });
}

/**
 * 读取当前 user_id。
 */
function readUserId(ctx: ServiceRouteContext): string {
  const user_id = String(ctx.user?.user_id ?? "").trim();
  if (!user_id) throw new TypeError("user_id is required");
  return user_id;
}

