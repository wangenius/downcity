/**
 * Session skills state store（service 内部状态）。
 *
 * 关键点（中文）
 * - 这是 skills service 的运行时状态容器
 * - core 不负责也不感知 skill/memory 业务状态
 */

import type { ClaudeSkill } from "@services/skills/types/ClaudeSkill.js";
import type {
  SessionSkillStateInternal,
  SessionSkillStateSnapshot,
} from "./Types.js";

const sessionSkillStateStore = new Map<string, SessionSkillStateInternal>();

/**
 * 归一化 sessionId。
 *
 * 关键点（中文）
 * - 空 sessionId 视为调用错误，直接抛异常，避免污染全局状态。
 */
function normalizeSessionId(sessionId: string): string {
  const value = String(sessionId || "").trim();
  if (!value) {
    throw new Error("sessionId is required for session skills state");
  }
  return value;
}

/**
 * 获取或创建 session 技能状态。
 */
function getOrCreateState(sessionId: string): SessionSkillStateInternal {
  const key = normalizeSessionId(sessionId);
  const existing = sessionSkillStateStore.get(key);
  if (existing) return existing;

  const created: SessionSkillStateInternal = {
    allSkillsById: new Map(),
    updatedAt: Date.now(),
  };
  sessionSkillStateStore.set(key, created);
  return created;
}

/**
 * 设置会话可用技能集合。
 *
 * 算法（中文）
 * - 以 id 归一化后整体替换，避免残留脏状态。
 */
export function setSessionAvailableSkills(sessionId: string, skills: ClaudeSkill[]): void {
  const state = getOrCreateState(sessionId);
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
export function getSessionSkillState(sessionId: string): SessionSkillStateSnapshot {
  const key = normalizeSessionId(sessionId);
  const state = sessionSkillStateStore.get(key);

  if (!state) {
    return {
      sessionId: key,
      allSkills: [],
      updatedAt: 0,
    };
  }

  return {
    sessionId: key,
    allSkills: Array.from(state.allSkillsById.values()),
    updatedAt: state.updatedAt,
  };
}

/**
 * 清理会话技能状态。
 */
export function clearSessionSkillState(sessionId: string): void {
  const key = normalizeSessionId(sessionId);
  sessionSkillStateStore.delete(key);
}
