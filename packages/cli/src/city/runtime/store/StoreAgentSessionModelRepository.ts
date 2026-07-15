/**
 * City Session 模型绑定仓储。
 *
 * 关键点（中文）
 * - Session 模型覆盖存放在 City 全局数据库，不写入 Agent SDK 的 session metadata。
 * - 仓储只处理持久化，不负责模型目录校验或运行时模型创建。
 */

import path from "node:path";
import type { PlatformStoreContext } from "@/city/runtime/store/StoreShared.js";
import type {
  AgentSessionModelBinding,
  UpsertAgentSessionModelBindingInput,
} from "@/city/types/AgentSessionModel.js";

/** 读取指定 Session 的模型覆盖。 */
export function get_agent_session_model_binding(
  context: PlatformStoreContext,
  project_root_input: string,
  session_id_input: string,
): AgentSessionModelBinding | null {
  const project_root = path.resolve(String(project_root_input || "."));
  const session_id = String(session_id_input || "").trim();
  if (!session_id) return null;
  const row = context.sqlite.prepare(`
    SELECT project_root, session_id, model_id, updated_at
    FROM agent_session_models
    WHERE project_root = ? AND session_id = ?
  `).get(project_root, session_id) as AgentSessionModelBinding | undefined;
  return row || null;
}

/** 新增或更新指定 Session 的模型覆盖。 */
export function upsert_agent_session_model_binding(
  context: PlatformStoreContext,
  input: UpsertAgentSessionModelBindingInput,
): AgentSessionModelBinding {
  const project_root = path.resolve(String(input.project_root || "."));
  const session_id = String(input.session_id || "").trim();
  const model_id = String(input.model_id || "").trim();
  if (!session_id) throw new Error("Session model binding requires session_id");
  if (!model_id) throw new Error("Session model binding requires model_id");
  const updated_at = new Date().toISOString();
  context.sqlite.prepare(`
    INSERT INTO agent_session_models (
      project_root,
      session_id,
      model_id,
      updated_at
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(project_root, session_id) DO UPDATE SET
      model_id = excluded.model_id,
      updated_at = excluded.updated_at
  `).run(project_root, session_id, model_id, updated_at);
  return {
    project_root,
    session_id,
    model_id,
    updated_at,
  };
}

/** 删除指定 Session 的模型覆盖。 */
export function remove_agent_session_model_binding(
  context: PlatformStoreContext,
  project_root_input: string,
  session_id_input: string,
): void {
  const project_root = path.resolve(String(project_root_input || "."));
  const session_id = String(session_id_input || "").trim();
  if (!session_id) return;
  context.sqlite.prepare(`
    DELETE FROM agent_session_models
    WHERE project_root = ? AND session_id = ?
  `).run(project_root, session_id);
}
