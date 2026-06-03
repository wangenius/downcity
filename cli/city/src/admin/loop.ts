/**
 * Admin 命令循环。
 *
 * 关键说明（中文）
 * - embedded 模式用于 user 工作区下的 server management
 * - 此时 admin 只作为低频管理工具，不再承担顶层导航职责
 */

import { City } from "@downcity/city";
import { select, isCancel } from "@clack/prompts";
import { type AdminSession } from "../core/session.js";
import { showError, showSuccess } from "../core/ui.js";
import { adminErrorMessage, isAdminAuthError } from "./auth-error.js";
import { manageEnv } from "./commands/service-env.js";
import { manageTowns } from "./commands/towns.js";
import { manageAccounts } from "./commands/accounts.js";
import { manageBalance } from "./commands/balance.js";
import { manageUsage } from "./commands/usage.js";
import { managePayment } from "./commands/payment.js";
import { manageCustom } from "./commands/custom.js";
import { manageModels } from "./commands/models.js";
import { manageInstruction } from "./commands/instruction.js";

const commands: Record<string, (a: City, baseUrl: string) => Promise<void>> = {
  env: manageEnv,
  instruction: manageInstruction,
  models: manageModels,
  towns: manageTowns,
  accounts: manageAccounts,
  balance: manageBalance,
  usage: manageUsage,
  payment: managePayment,
  custom: manageCustom,
};

export async function adminLoop(
  session: AdminSession,
  options?: { embedded?: boolean },
): Promise<"logout" | "quit" | "switch_identity" | "back"> {
  const admin = new City({
    role: "admin",
    city_url: session.base_url,
    admin_secret_key: session.admin_secret_key,
  });
  const embedded = options?.embedded === true;

  while (true) {
    const svc = await select({
      message: embedded ? "Server management" : "Manage Service",
      options: [
        { label: "Env", value: "env", hint: "View & configure environment variables" },
        { label: "City Instruction", value: "instruction", hint: "Read aggregated city/service guidance" },
        { label: "Models", value: "models", hint: "Read model readiness and missing env" },
        { label: "Towns", value: "towns" },
        { label: "Accounts", value: "accounts" },
        { label: "Balance", value: "balance" },
        { label: "Usage", value: "usage" },
        { label: "Payment (Stripe)", value: "payment" },
        { label: "Custom service...", value: "custom" },
        ...(embedded
          ? [{ label: "Back", value: "back" }]
          : [
            { label: "Switch to User", value: "switch" },
            { label: "Logout", value: "logout" },
          ]),
        { label: "Quit", value: "quit" },
      ],
    });
    if (!svc || isCancel(svc)) return embedded ? "back" : "quit";

    if (svc === "quit") return "quit";
    if (svc === "back") return "back";
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
