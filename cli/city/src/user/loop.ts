/**
 * User 命令循环。
 *
 * 关键说明（中文）
 * - models 合并了列表展示与选择切换，委托到 models.ts。
 * - me / services / service 保持内联（逻辑简单）。
 * - server management 与 switch city 由外层工作区负责调度。
 */

import { City } from "@downcity/city";
import { type UserContext } from "../auth/user.js";
import { clearUserSession } from "../core/session.js";
import { askUserCommand, askText, show, showError, showSuccess } from "../core/ui.js";
import { createTopup, rechargeWithStripe, redeemCode, showBalance, showBalanceHistory, showTopups } from "./balance.js";
import { doModels } from "./models.js";

type Result = "signed_out" | "quit" | "switch_server" | "server_management";

export async function userLoop(ctx: UserContext): Promise<Result> {
  const client = new City({
    role: "user",
    city_url: ctx.session.base_url,
    town_id: ctx.session.town_id,
    user_token: ctx.session.user_token,
  });

  while (true) {
    const cmd = await askUserCommand();
    if (!cmd) continue;

    try {
      const r = await execute(client, ctx, cmd);
      if (r === "quit") return "quit";
      if (r === "signed_out") return "signed_out";
      if (r === "switch_server") return "switch_server";
      if (r === "server_management") return "server_management";
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  }
}

async function execute(
  c: City,
  ctx: UserContext,
  cmd: string,
): Promise<"continue" | "signed_out" | "quit" | "switch_server" | "server_management"> {
  switch (cmd) {
    case "models":
      await doModels(c, ctx);
      return "continue";

    case "balance":
      await showBalance(c);
      return "continue";

    case "history":
      await showBalanceHistory(c);
      return "continue";

    case "topups":
      await showTopups(c);
      return "continue";

    case "recharge":
      await rechargeWithStripe(c, ctx.session.base_url);
      return "continue";

    case "topup_create":
      await createTopup(c);
      return "continue";

    case "redeem_code":
      await redeemCode(c);
      return "continue";

    case "me": {
      const b = await c.service("accounts").get<{ user?: { user_id: string; email: string } }>("me");
      if (b.user) show(`user_id: ${b.user.user_id}\nemail: ${b.user.email}`);
      return "continue";
    }

    case "services":
      show(
        (await c.listServices())
          .map((service) => `${service.id} - ${service.name}`)
          .join("\n"),
      );
      return "continue";

    case "service": {
      const n = await askText("service name");
      if (n) show(JSON.stringify(await c.service(n).action("").invoke({}), null, 2));
      return "continue";
    }

    case "server_management":
      return "server_management";

    case "switch_server":
      return "switch_server";

    case "sign_out":
      clearUserSession(ctx.session.base_url);
      showSuccess("signed out");
      return "signed_out";

    case "quit":
      return "quit";

    default:
      showError(`unknown: ${cmd}`);
      return "continue";
  }
}
