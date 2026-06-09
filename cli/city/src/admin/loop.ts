/**
 * Admin 命令循环。
 *
 * 关键说明（中文）
 * - embedded 模式用于 user 工作区下的 server management
 * - 此时 admin 只作为低频管理工具，不再承担顶层导航职责
 */

import { City } from "@downcity/city";
import { select, isCancel } from "../tui/Prompts.js";
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
import { t } from "../i18n.js";

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
      message: embedded
        ? t({
          zh: "Server 管理",
          en: "Server management",
        })
        : t({
          zh: "管理服务",
          en: "Manage Service",
        }),
      options: [
        {
          label: "Env",
          value: "env",
          hint: t({
            zh: "查看并配置环境变量",
            en: "View and configure environment variables",
          }),
        },
        {
          label: t({
            zh: "City 指令",
            en: "City Instruction",
          }),
          value: "instruction",
          hint: t({
            zh: "读取聚合后的 city/service 指引",
            en: "Read aggregated city/service guidance",
          }),
        },
        {
          label: "Models",
          value: "models",
          hint: t({
            zh: "查看模型就绪状态与缺失 env",
            en: "Read model readiness and missing env requirements",
          }),
        },
        { label: "Towns", value: "towns" },
        { label: "Accounts", value: "accounts" },
        { label: "Balance", value: "balance" },
        { label: "Usage", value: "usage" },
        { label: "Payment (Stripe)", value: "payment" },
        {
          label: t({
            zh: "自定义服务...",
            en: "Custom service...",
          }),
          value: "custom",
        },
        ...(embedded
          ? [{
            label: t({
              zh: "返回",
              en: "Back",
            }),
            value: "back",
          }]
          : [
            {
              label: t({
                zh: "切换到 User",
                en: "Switch to User",
              }),
              value: "switch",
            },
            {
              label: t({
                zh: "退出登录",
                en: "Logout",
              }),
              value: "logout",
            },
          ]),
        {
          label: t({
            zh: "退出",
            en: "Quit",
          }),
          value: "quit",
        },
      ],
    });
    if (!svc || isCancel(svc)) return embedded ? "back" : "quit";

    if (svc === "quit") return "quit";
    if (svc === "back") return "back";
    if (svc === "logout") {
      showSuccess(t({
        zh: "已退出 admin 模式",
        en: "left admin mode",
      }));
      return "logout";
    }
    if (svc === "switch") return "switch_identity";

    try {
      const command_key = String(svc);
      await commands[command_key]?.(admin, session.base_url);
    } catch (e) {
      if (isAdminAuthError(e)) {
        showError(adminErrorMessage(e));
        return "logout";
      }
      showError(adminErrorMessage(e));
    }
  }
}
