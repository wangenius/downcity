/**
 * Admin Env 管理命令。
 *
 * 三种模式：
 * - Init：遍历所有 service 的 env 需求，逐一交互式配置
 * - 按 Service 查看：选择一个 service，查看/配置其 env
 * - 直接管理：list / upsert / remove 裸 key-value
 */

import { Gate } from "@downcity/city";
import { select, isCancel } from "@clack/prompts";
import { askText, show, showError, showSuccess } from "../../core/ui.js";
import { adminErrorMessage, isAdminNotFoundError, rethrowAdminAuthError } from "../auth-error.js";

interface EnvRequirement {
  /** 环境变量 key */
  key: string;
  /** 给管理员展示的说明文本 */
  description: string;
  /** 当前是否必须配置 */
  required: boolean;
  /** 当前 City 是否已配置该 key */
  configured: boolean;
  /** 当前值的安全预览 */
  value_preview?: string;
}

interface ServiceEnv {
  /** 逻辑分组 ID */
  id: string;
  /** 分组展示名称 */
  name: string;
  /** 当前分组包含的 env 需求列表 */
  env: EnvRequirement[];
}

export async function manageEnv(a: Gate): Promise<void> {
  while (true) {
    const services = await fetchEnvScopes(a);

    const choices: { label: string; value: string; hint?: string }[] = [
      { label: "Init (walk through all)", value: "__init__", hint: "Configure all missing env keys in sequence" },
      { label: "List all", value: "__list__", hint: "Show all configured env variables" },
      { label: "Upsert", value: "__upsert__", hint: "Add or update a key=value" },
      { label: "Update", value: "__update__", hint: "Update an existing key" },
      { label: "Remove", value: "__remove__", hint: "Delete a key" },
    ];

    if (services) {
      for (const s of services) {
        const configured = s.env.filter((item) => item.configured).length;
        choices.push({
          label: `  ${s.name} (${configured}/${s.env.length} configured)`,
          value: s.id,
          hint: s.env.map((e) => `${e.key}${e.configured ? "✓" : ""}`).join(", "),
        });
      }
    }

    choices.push({ label: "Back", value: "back", hint: "Return to admin menu" });

    const svcId = await select({ message: "Env", options: choices });
    if (!svcId || isCancel(svcId) || svcId === "back") return;

    if (svcId === "__init__" && services) { await initAllEnv(a, services); continue; }
    if (svcId === "__list__") { await listAllEnv(a); continue; }
    if (svcId === "__upsert__") { await upsertEnv(a); continue; }
    if (svcId === "__update__") { await updateEnv(a); continue; }
    if (svcId === "__remove__") { await removeEnv(a); continue; }

    if (services) {
      const svc = services.find((s) => s.id === svcId);
      if (svc) await configureServiceEnv(a, svc);
    }
  }
}

// ============================================================
// Init 模式
// ============================================================

async function initAllEnv(a: Gate, services: ServiceEnv[]): Promise<void> {
  const configuredKeys = new Set(
    services.flatMap((svc) => svc.env.filter((item) => item.configured).map((item) => item.key)),
  );
  let changed = false;

  for (const svc of services) {
    show(`\n── ${svc.name} ──────────────────────────────`);
    for (const req of svc.env) {
      if (configuredKeys.has(req.key)) { show(`  ${req.key} ✓ (already set)`); continue; }

      const label = req.required
        ? `${req.key} (${req.description})`
        : `${req.key} (${req.description}, optional — enter to skip)`;

      const value = await askText(label);
      if (!value) { if (req.required) show(`  ${req.key} ✗ skipped (required)`); continue; }

      try {
        await a.env.upsert({ key: req.key, value });
        configuredKeys.add(req.key);
        showSuccess(`  ${req.key}`);
        changed = true;
      } catch (e) {
        rethrowAdminAuthError(e);
        showError(`  ${req.key}: ${adminErrorMessage(e)}`);
      }
    }
  }

  if (changed) showSuccess("\nEnv init complete.");
  else show("\nAll env keys are already configured.");
}

// ============================================================
// 直接管理模式
// ============================================================

async function listAllEnv(a: Gate): Promise<void> {
  try {
    const items = await a.env.list();
    if (items.length === 0) { show("No env variables configured."); return; }
    console.log(`\n${items.length} env:\n`);
    for (const e of items) {
      console.log(`  ${e.key.padEnd(35)} ${maskValue(e.value, 40)}`);
    }
    console.log("");
  } catch (e) {
    rethrowAdminAuthError(e);
    showError(adminErrorMessage(e));
  }
}

async function upsertEnv(a: Gate): Promise<void> {
  const key = await askText("key");
  if (!key) return;
  const value = await askText("value");
  if (!value) return;
  try {
    await a.env.upsert({ key, value });
    showSuccess(`upserted: ${key}`);
  } catch (e) {
    rethrowAdminAuthError(e);
    showError(adminErrorMessage(e));
  }
}

async function updateEnv(a: Gate): Promise<void> {
  const items = await fetchCurrentEnv(a);
  if (items.length === 0) { show("No env variables to update."); return; }

  const choices = items.map((e) => ({
    label: e.key, value: e.key, hint: `current: ${maskValue(e.value, 20)}`,
  }));
  choices.push({ label: "Cancel", value: "__cancel__", hint: "Return without changes" });

  const key = await select({ message: "Select key to update", options: choices });
  if (!key || isCancel(key) || key === "__cancel__") return;

  const current = items.find((e) => e.key === key)!;
  const value = await askText(`New value (current: ${maskValue(current.value, 16)})`);
  if (!value) return;

  try {
    await a.env.upsert({ key: key as string, value });
    showSuccess(`updated: ${key}`);
  } catch (e) {
    rethrowAdminAuthError(e);
    showError(adminErrorMessage(e));
  }
}

async function removeEnv(a: Gate): Promise<void> {
  const key = await askText("key");
  if (!key) return;
  try {
    await a.env.remove(key);
    showSuccess(`removed: ${key}`);
  } catch (e) {
    rethrowAdminAuthError(e);
    showError(adminErrorMessage(e));
  }
}

// ============================================================
// 按 Service 查看
// ============================================================

async function configureServiceEnv(a: Gate, svc: ServiceEnv): Promise<void> {
  while (true) {
    const scopes = await fetchEnvScopes(a);
    const currentScope = scopes?.find((item) => item.id === svc.id) ?? svc;

    const choices = currentScope.env.map((req) => {
      const status = req.configured
        ? `✓ configured${req.value_preview ? ` (${req.value_preview})` : ""}`
        : (req.required ? "✗ MISSING" : "○ unset");
      return { label: req.key, value: req.key, hint: `${req.description} [${status}]` };
    });
    choices.push({ label: "Back", value: "back", hint: "Return to env menu" });

    const key = await select({ message: `${svc.name} — configure`, options: choices });
    if (!key || isCancel(key) || key === "back") return;

    const req = currentScope.env.find((e) => e.key === key)!;
    const hint = req.configured
      ? `(current: ${req.value_preview ?? "configured"}, enter a new value to replace it)`
      : "";
    const value = await askText(`${req.description} ${hint}`);
    if (!value) continue;

    try {
      if (value) { await a.env.upsert({ key: req.key, value }); showSuccess(`set ${req.key}`); }
    } catch (e) {
      rethrowAdminAuthError(e);
      showError(adminErrorMessage(e));
    }
  }
}

// ============================================================
// 工具
// ============================================================

async function fetchEnvScopes(a: Gate): Promise<ServiceEnv[] | undefined> {
  try {
    const scopes = await a.env.catalog();
    if (scopes.length === 0) {
      show("No services or AI models with env requirements found.");
      return undefined;
    }
    return scopes;
  } catch (e) {
    rethrowAdminAuthError(e);
    if (isAdminNotFoundError(e)) {
      showError("Connected City is too old and does not expose /v1/env/catalog yet. Deploy the latest worker/server first.")
      return undefined;
    }
    showError(`Failed to fetch env catalog: ${adminErrorMessage(e)}`);
    return undefined;
  }
}

async function fetchCurrentEnv(a: Gate): Promise<{ key: string; value: string }[]> {
  try {
    return await a.env.list();
  } catch (e) {
    rethrowAdminAuthError(e);
    return [];
  }
}

function maskValue(v: string, n: number): string {
  return v.length <= n ? v : v.slice(0, n) + "...";
}
