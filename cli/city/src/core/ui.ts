/**
 * UI 工具模块。
 *
 * 提供 CLI 交互所需的输入/输出封装。
 * 模型选择接受通用的 { id, name, hint } 数组，不依赖 server model 类型。
 */

import { password, select, text, isCancel, intro, log } from "@clack/prompts";

export { intro, log, isCancel };

// ============================================================
// 显示函数
// ============================================================

export function show(text: string): void { log.info(text); }
export function showError(text: string): void { log.error(text); }
export function showSuccess(text: string): void { log.success(text); }

// ============================================================
// 交互 prompts
// ============================================================

/** 主命令菜单 */
export async function askUserCommand(): Promise<string | undefined> {
  const s = await select({ message: "Workspace", options: [
    { label: "Models", value: "models", hint: "List and select model" },
    { label: "Balance", value: "balance", hint: "View current balance" },
    { label: "History", value: "history", hint: "View balance ledger" },
    { label: "Topups", value: "topups", hint: "View recharge orders" },
    { label: "Recharge (Stripe)", value: "recharge", hint: "Create Checkout and pay in browser" },
    { label: "Create topup", value: "topup_create", hint: "Create a pending topup order only" },
    { label: "Redeem code", value: "redeem_code", hint: "Redeem a one-time credit code" },
    { label: "My profile", value: "me" },
    { label: "List services", value: "services" },
    { label: "Call service", value: "service" },
    { label: "Server management", value: "server_management", hint: "Low-frequency admin access and local connection settings" },
    { label: "Switch City", value: "switch_server" },
    { label: "Sign out", value: "sign_out" },
    { label: "Exit", value: "quit" },
  ]});
  if (!s || isCancel(s)) return undefined;
  return s as string;
}

/** 文本输入 */
export async function askText(label: string): Promise<string | undefined> {
  const v = await text({ message: label });
  return (!v || isCancel(v)) ? undefined : v as string;
}

/** 密码输入 */
export async function askSecret(label: string): Promise<string | undefined> {
  const v = await password({ message: label });
  return (!v || isCancel(v)) ? undefined : v as string;
}

// ============================================================
// 模型选择（通用，不依赖 server 类型）
// ============================================================

/** 模型选项 */
export interface ModelOption {
  /** 模型 ID */
  id: string;
  /** 模型展示名 */
  name: string;
  /** 提示信息 */
  hint: string;
}

/** 列出并选择模型，返回模型 id 或 undefined */
export async function askModel(
  models: ModelOption[],
  currentModel: string,
): Promise<string | undefined> {
  const options = models.map((m) => ({
    label: m.id === currentModel ? `★ ${m.name}` : `   ${m.name}`,
    value: m.id,
    hint: m.hint,
  }));
  const s = await select({ message: "Select model (★ current)", options });
  return (!s || isCancel(s)) ? undefined : String(s);
}
