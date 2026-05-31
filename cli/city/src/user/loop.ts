/**
 * User 命令循环。返回 "logout" | "quit" | "switch_identity"。
 *
 * 关键说明（中文）
 * - models 合并了列表展示与选择切换，委托到 models.ts。
 * - me / services / service 保持内联（逻辑简单）。
 */

import { UserClient } from "@downcity/city";
import { type UserContext } from "../auth/user.js";
import { clearUserSession } from "../core/session.js";
import { askUserCommand, askText, show, showError, showSuccess } from "../core/ui.js";
import { createTopup, rechargeWithStripe, redeemCode, showBalance, showBalanceHistory, showTopups } from "./balance.js";
import { doModels } from "./models.js";

type Result = "logout" | "quit" | "switch_identity";

export async function userLoop(ctx: UserContext): Promise<Result> {
  const client = new UserClient({
    base_url: ctx.session.base_url,
    studio_id: ctx.session.studio_id,
    user_token: ctx.session.user_token,
  });

  while (true) {
    const cmd = await askUserCommand();
    if (!cmd) continue;
    if (cmd === "switch") return "switch_identity";

    try {
      const r = await execute(client, ctx, cmd);
      if (r === "quit") return "quit";
      if (r === "logout") return "logout";
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  }
}

async function execute(
  c: UserClient,
  ctx: UserContext,
  cmd: string,
): Promise<"continue" | "logout" | "quit"> {
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
      await rechargeWithStripe(c);
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

    case "logout":
      clearUserSession(ctx.session.base_url);
      showSuccess("logged out");
      return "logout";

    case "quit":
      return "quit";

    default:
      showError(`unknown: ${cmd}`);
      return "continue";
  }
}
