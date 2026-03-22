/**
 * Context skills state store（service 内部状态）。
 *
 * 关键点（中文）
 * - 这是 skills service 的运行时状态容器
 * - core 不负责也不感知 skill/memory 业务状态
 */

import type { ClaudeSkill } from "@services/skills/types/ClaudeSkill.js";
import type {
  ContextSkillStateInternal,
  ContextSkillStateSnapshot,
} from "./Types.js";

const contextSkillStateStore = new Map<string, ContextSkillStateInternal>();

/**
 * 归一化 contextId。
 *
 * 关键点（中文）
 * - 空 contextId 视为调用错误，直接抛异常，避免污染全局状态。
 */
function normalizeContextId(contextId: string): string {
  const value = String(contextId || "").trim();
  if (!value) {
    throw new Error("contextId is required for context skills state");
  }
  return value;
}

/**
 * 获取或创建 context 技能状态。
 */
function getOrCreateState(contextId: string): ContextSkillStateInternal {
  const key = normalizeContextId(contextId);
  const existing = contextSkillStateStore.get(key);
  if (existing) return existing;

  const created: ContextSkillStateInternal = {
    allSkillsById: new Map(),
    updatedAt: Date.now(),
  };
  contextSkillStateStore.set(key, created);
  return created;
}

/**
 * 设置会话可用技能集合。
 *
 * 算法（中文）
 * - 以 id 归一化后整体替换，避免残留脏状态。
 */
export function setContextAvailableSkills(contextId: string, skills: ClaudeSkill[]): void {
  const state = getOrCreateState(contextId);
  const next = new Map<string, ClaudeSkill>();

  for (const skill of Array.isArray(skills) ? skills : []) {
    const id = String(skill?.id || "").trim();
    if (!id) continue;
    next.set(id, skill);
  }

  state.allSkillsById = next;
  state.updatedAt = Date.now();
}

/**
 * 获取会话技能状态快照。
 */
export function getContextSkillState(contextId: string): ContextSkillStateSnapshot {
  const key = normalizeContextId(contextId);
  const state = contextSkillStateStore.get(key);

  if (!state) {
    return {
      contextId: key,
      allSkills: [],
      updatedAt: 0,
    };
  }

  return {
    contextId: key,
    allSkills: Array.from(state.allSkillsById.values()),
    updatedAt: state.updatedAt,
  };
}

/**
 * 清理会话技能状态。
 */
export function clearContextSkillState(contextId: string): void {
  const key = normalizeContextId(contextId);
  contextSkillStateStore.delete(key);
}
