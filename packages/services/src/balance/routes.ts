/**
 * Balance 服务 HTTP 路由装配模块。
 *
 * 关键说明（中文）
 * - 这里只负责把公开 action 映射到 HTTP 路由
 * - 余额读写、充值单和兑换码状态变更仍然收敛在 BalanceService 内部
 */

import type { ServiceInstallContext, ServiceRouteContext } from "@downcity/city";
import type { BalanceService } from "./service.js";
import type { BalanceExtra } from "./types.js";
import { normalizeUserId, readRequired, toBalanceUserView } from "./utils.js";

interface BalanceMutationBody extends Record<string, unknown>, BalanceExtra {
  /**
   * 目标用户 ID。
   */
  user_id?: string;

  /**
   * 变动金额。
   */
  amount?: number;

  /**
   * 变动金额，单位为 microcredits。
   */
  amount_microcredits?: number;

  /**
   * 结构化扣费审计信息。
   */
  metadata?: Record<string, unknown>;

}

interface BalanceFinishTopupBody extends Record<string, unknown>, BalanceExtra {
  /**
   * 充值单 ID。
   */
  topup_id?: string;
}

interface BalanceQueryBody extends Record<string, unknown> {
  /**
   * 可选用户 ID。
   */
  user_id?: string;

  /**
   * 可选状态。
   */
  status?: string;

  /**
   * 返回条数上限。
   */
  limit?: string | number;
}

interface BalanceRedeemCodeCreateBody extends Record<string, unknown>, BalanceExtra {
  /**
   * redeem_code 金额。
   */
  amount?: number;

  /**
   * 可选自定义 redeem_code。
   */
  code?: string;
}

interface BalanceRedeemCodeRedeemBody extends Record<string, unknown>, BalanceExtra {
  /**
   * 用户输入的 redeem_code 明文。
   */
  code?: string;
}

interface BalanceRedeemCodeDisableBody extends Record<string, unknown>, BalanceExtra {
  /**
   * redeem_code ID。
   */
  redeem_code_id?: string;
}

/**
 * 注册 Balance 服务的 HTTP 路由。
 */
export function registerBalanceRoutes(service: BalanceService, ctx: ServiceInstallContext): void {
  ctx.route({
    method: "GET",
    path: "/me",
    auth: ["user"],
    handler: async (c) => c.jsonResponse(toBalanceUserView(await service.read(readUserId(c)))),
  });

  ctx.route({
    method: "GET",
    path: "/history/me",
    auth: ["user"],
    handler: async (c) => {
      const input = await c.json<BalanceQueryBody>();
      return c.jsonResponse({ items: await service.history(readUserId(c), input.limit) });
    },
  });

  ctx.route({
    method: "GET",
    path: "/charges/me",
    auth: ["user"],
    handler: async (c) => {
      const input = await c.json<BalanceQueryBody>();
      return c.jsonResponse({
        items: await service.listCharges({ user_id: readUserId(c), limit: input.limit }),
      });
    },
  });

  ctx.route({
    method: "GET",
    path: "/topups/me",
    auth: ["user"],
    handler: async (c) => {
      const input = await c.json<BalanceQueryBody>();
      return c.jsonResponse({
        items: await service.listTopups({ user_id: readUserId(c), limit: input.limit }),
      });
    },
  });

  ctx.route({
    method: "POST",
    path: "/topups/create",
    auth: ["user"],
    handler: async (c) => {
      const body = await c.json<BalanceMutationBody>();
      return c.jsonResponse(await service.createTopup(readUserId(c), body.amount, body));
    },
  });

  ctx.route({
    method: "POST",
    path: "/redeem-codes/redeem",
    auth: ["user"],
    handler: async (c) => {
      const body = await c.json<BalanceRedeemCodeRedeemBody>();
      return c.jsonResponse(await service.redeemCode(readUserId(c), body.code, body));
    },
  });

  ctx.route({
    method: "GET",
    path: "/users",
    auth: ["admin"],
    handler: async (c) => {
      const input = await c.json<BalanceQueryBody>();
      return c.jsonResponse({ items: await service.listUsers(input.limit) });
    },
  });

  ctx.route({
    method: "GET",
    path: "/history",
    auth: ["admin"],
    handler: async (c) => {
      const input = await c.json<BalanceQueryBody>();
      return c.jsonResponse({ items: await service.listHistory(input) });
    },
  });

  ctx.route({
    method: "GET",
    path: "/charges",
    auth: ["admin"],
    handler: async (c) => {
      const input = await c.json<BalanceQueryBody>();
      return c.jsonResponse({ items: await service.listCharges(input) });
    },
  });

  ctx.route({
    method: "GET",
    path: "/topups",
    auth: ["admin"],
    handler: async (c) => {
      const input = await c.json<BalanceQueryBody>();
      return c.jsonResponse({ items: await service.listTopups(input) });
    },
  });

  ctx.route({
    method: "GET",
    path: "/redeem-codes",
    auth: ["admin"],
    handler: async (c) => {
      const input = await c.json<BalanceQueryBody>();
      return c.jsonResponse({
        items: await service.listRedeemCodes({
          user_id: input.user_id,
          status: input.status,
          limit: input.limit,
        }),
      });
    },
  });

  ctx.route({
    method: "POST",
    path: "/add",
    auth: ["admin"],
    handler: async (c) => {
      const body = await c.json<BalanceMutationBody>();
      return c.jsonResponse(await service.add(readRequired(body.user_id, "user_id"), Number(body.amount), body));
    },
  });

  ctx.route({
    method: "POST",
    path: "/sub",
    auth: ["admin"],
    handler: async (c) => {
      const body = await c.json<BalanceMutationBody>();
      return c.jsonResponse(await service.sub(readRequired(body.user_id, "user_id"), Number(body.amount), body));
    },
  });

  ctx.route({
    method: "POST",
    path: "/charge",
    auth: ["admin"],
    handler: async (c) => {
      const body = await c.json<BalanceMutationBody>();
      return c.jsonResponse(await service.charge({
        user_id: readRequired(body.user_id, "user_id"),
        amount_microcredits: Number(body.amount_microcredits),
        note: body.note,
        ref: body.ref,
        meta: body.meta,
        metadata: body.metadata,
      }));
    },
  });

  ctx.route({
    method: "POST",
    path: "/topups/finish",
    auth: ["admin"],
    handler: async (c) => {
      const body = await c.json<BalanceFinishTopupBody>();
      return c.jsonResponse(await service.finishTopup(readRequired(body.topup_id, "topup_id"), body));
    },
  });

  ctx.route({
    method: "POST",
    path: "/topups/cancel",
    auth: ["admin"],
    handler: async (c) => {
      const body = await c.json<BalanceFinishTopupBody>();
      return c.jsonResponse(await service.cancelTopup(readRequired(body.topup_id, "topup_id"), body));
    },
  });

  ctx.route({
    method: "POST",
    path: "/redeem-codes/create",
    auth: ["admin"],
    handler: async (c) => {
      const body = await c.json<BalanceRedeemCodeCreateBody>();
      return c.jsonResponse(await service.createRedeemCode({
        amount: Number(body.amount),
        code: body.code,
        note: body.note,
        ref: body.ref,
        meta: body.meta,
      }));
    },
  });

  ctx.route({
    method: "POST",
    path: "/redeem-codes/disable",
    auth: ["admin"],
    handler: async (c) => {
      const body = await c.json<BalanceRedeemCodeDisableBody>();
      return c.jsonResponse(await service.disableRedeemCode(
        readRequired(body.redeem_code_id, "redeem_code_id"),
        body,
      ));
    },
  });
}

/**
 * 读取当前 user_id。
 */
function readUserId(ctx: ServiceRouteContext): string {
  return normalizeUserId(ctx.user?.user_id ?? "");
}
