/**
 * User Models 命令 — 模型列表与选择。
 *
 * 从 server 获取模型目录，显示并允许用户切换。
 */

import type { UserClient, ModelCatalog } from "@downcity/conduit";
import { type UserContext } from "../auth/user.js";
import { askModel, type ModelOption, show, showError, showSuccess } from "../core/ui.js";
import { readConfig, writeConfig } from "../core/session.js";

/** 列出模型并选择切换 */
export async function doModels(c: UserClient, ctx: UserContext): Promise<void> {
  let catalog: ModelCatalog;
  try {
    catalog = await c.ai.listModels();
  } catch (e) {
    showError(`Failed to fetch models: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  const all = catalog.all();
  if (all.length === 0) {
    showError("No ready models available from server. Configure provider env first.");
    return;
  }

  const currentModel = ctx.config.model || catalog.default()?.id || "";
  show(`Current model: ${currentModel || "(none)"}`);

  const options: ModelOption[] = all.map((m) => ({
    id: m.id,
    name: m.name,
    hint: m.description || m.tags?.join(", ") || "",
  }));

  const selected = await askModel(options, currentModel);
  if (selected) {
    ctx.config.model = selected;
    const cfg = readConfig(); cfg.model = selected; writeConfig(cfg);
    showSuccess(`Model switched to: ${selected}`);
  }
}
