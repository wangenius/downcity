/**
 * Active skills prompt 构建器。
 *
 * 关键点（中文）
 * - 将已加载 skills 渲染为强约束 system prompt。
 */

import type { LoadedSkillV1 } from "@services/skills/types/LoadedSkill.js";

/**
 * 生成 active skills 的 system prompt。
 *
 * 关键点（中文）
 * - 这是 skills service 的运行时实现细节，不属于 core/prompts
 * - 只负责渲染提示词文本，不做执行层工具白名单约束
 */
/**
 * 构建 active skills system 文本。
 *
 * 算法（中文）
 * 1) 按 loaded skills 逐个拼接强约束说明
 * 2) 保留每个 skill 的工具限制描述（文本约束）
 */
export function buildLoadedSkillsSystemText(params: {
  loaded: Map<string, LoadedSkillV1>;
}): string | null {
  const { loaded } = params;
  if (!loaded || loaded.size === 0) return null;

  const skills = Array.from(loaded.values());
  const lines: string[] = [];
  lines.push("# ACTIVE SKILLS — MANDATORY EXECUTION");
  lines.push("");
  lines.push(
    `You have ${skills.length} active skill(s). These are NOT suggestions — they are binding SOPs you MUST follow.`,
  );
  lines.push("");

  for (const skill of skills) {
    lines.push(`## Skill: ${skill.name}`);
    lines.push(`**ID:** ${skill.id}`);
    lines.push(`**Path:** ${skill.skillMdPath}`);

    if (Array.isArray(skill.allowedTools) && skill.allowedTools.length > 0) {
      lines.push(
        `**Tool Restriction:** You can ONLY use these tools: ${skill.allowedTools.join(", ")} (plus exec_command/write_stdin/close_shell for command workflow)`,
      );
    } else {
      lines.push("**Tool Restriction:** None (all tools available)");
    }

    lines.push("");
    lines.push("### Instructions (MUST FOLLOW):");
    lines.push(skill.content);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  lines.push("## Execution Priority");
  lines.push(
    "1. Active skills take HIGHEST priority — their instructions override general guidelines",
  );
  lines.push("2. If multiple skills are active, follow all their constraints");
  lines.push(
    "3. Tool restrictions are strict requirements in these instructions",
  );

  return lines.join("\n").trim();
}
