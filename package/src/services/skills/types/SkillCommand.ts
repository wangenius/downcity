/**
 * Skills 命令协议类型。
 *
 * 关键点（中文）
 * - skills 模块自有 DTO 就近放在 skills/types
 * - server/cli/service 共用同一份定义
 */

export type SkillSummary = {
  id: string;
  name: string;
  description: string;
  source: string;
  skillMdPath: string;
  allowedTools: string[];
};

export type SkillListResponse = {
  success: true;
  skills: SkillSummary[];
};

export type SkillLoadRequest = {
  name: string;
};

export type SkillLoadResponse = {
  success: boolean;
  skill?: SkillSummary;
  content?: string;
  error?: string;
};
