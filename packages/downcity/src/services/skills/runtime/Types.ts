import type { ClaudeSkill } from "@services/skills/types/ClaudeSkill.js";

/**
 * Context skills state 对外快照。
 *
 * 关键点（中文）
 * - 这是 service 侧暴露给调试/观察的只读结构
 * - core 不依赖该结构
 */
export type ContextSkillStateSnapshot = {
  contextId: string;
  allSkills: ClaudeSkill[];
  updatedAt: number;
};

/**
 * Context skills state 内部结构。
 */
export type ContextSkillStateInternal = {
  allSkillsById: Map<string, ClaudeSkill>;
  updatedAt: number;
};
