import type { ClaudeSkill } from "@/shared/types/ClaudeSkill.js";

/**
 * Session skills state 对外快照。
 *
 * 关键点（中文）
 * - 这是 service 侧暴露给调试/观察的只读结构
 * - core 不依赖该结构
 */
export type SessionSkillStateSnapshot = {
  sessionId: string;
  allSkills: ClaudeSkill[];
  updatedAt: number;
};

/**
 * Session skills state 内部结构。
 */
export type SessionSkillStateInternal = {
  allSkillsById: Map<string, ClaudeSkill>;
  updatedAt: number;
};
