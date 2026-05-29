/**
 * Admin 命令循环。返回 "logout" | "quit" | "switch_identity"。
 */

import { AdminClient } from "@downcity/gate";
import { select, isCancel } from "@clack/prompts";
import { type AdminSession } from "../core/session.js";
import { showError, showSuccess } from "../core/ui.js";
import { adminErrorMessage, isAdminAuthError } from "./auth-error.js";
import { manageEnv } from "./commands/service-env.js";
import { manageStudios } from "./commands/studios.js";
import { manageAccounts } from "./commands/accounts.js";
import { manageBalance } from "./commands/balance.js";
import { manageUsage } from "./commands/usage.js";
import { managePayment } from "./commands/payment.js";
import { manageCustom } from "./commands/custom.js";
import { manageModels } from "./commands/models.js";
import { manageInstruction } from "./commands/instruction.js";

const commands: Record<string, (a: AdminClient, baseUrl: string) => Promise<void>> = {
  env: manageEnv,
  instruction: manageInstruction,
  models: manageModels,
  studios: manageStudios,
  accounts: manageAccounts,
  balance: manageBalance,
  usage: manageUsage,
  payment: managePayment,
  custom: manageCustom,
};

export async function adminLoop(session: AdminSession): Promise<"logout" | "quit" | "switch_identity"> {
  const admin = new AdminClient({ base_url: session.base_url, admin_secret_key: session.admin_secret_key });

  while (true) {
    const svc = await select({
      message: "Manage Service",
      options: [
        { label: "Env", value: "env", hint: "View & configure environment variables" },
        { label: "City Instruction", value: "instruction", hint: "Read aggregated city/service guidance" },
        { label: "Models", value: "models", hint: "Read model readiness and missing env" },
        { label: "Studios", value: "studios" },
        { label: "Accounts", value: "accounts" },
        { label: "Balance", value: "balance" },
        { label: "Usage", value: "usage" },
        { label: "Payment (Stripe)", value: "payment" },
        { label: "Custom service...", value: "custom" },
        { label: "Switch to User", value: "switch" },
        { label: "Logout", value: "logout" },
        { label: "Quit", value: "quit" },
      ],
    });
    if (!svc || isCancel(svc)) return "quit";

    if (svc === "quit") return "quit";
    if (svc === "logout") { showSuccess("left admin mode"); return "logout"; }
    if (svc === "switch") return "switch_identity";

    try {
      await commands[svc]?.(admin, session.base_url);
    } catch (e) {
      if (isAdminAuthError(e)) {
        showError(adminErrorMessage(e));
        return "logout";
      }
      showError(adminErrorMessage(e));
    }
  }
}
