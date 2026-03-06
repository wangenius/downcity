/**
 * Skills prompt section 渲染器。
 *
 * 关键点（中文）
 * - 负责把“可用 skills + 扫描根目录”格式化为 system prompt 文本。
 * - 仅做字符串渲染，不做文件 IO。
 */

import type { ShipConfig } from "@/main/server/env/Config.js";
import { getClaudeSkillSearchRoots } from "./Paths.js";
import type { ClaudeSkill } from "@services/skills/types/ClaudeSkill.js";

/**
 * 渲染 skills 系统提示片段。
 *
 * 约束（中文）
 * - 为控制 token 成本，最多展示前 40 个 skill。
 * - roots 会按扫描顺序输出，便于排查冲突覆盖。
 */
export function renderClaudeSkillsPromptSection(
  projectRoot: string,
  config: ShipConfig,
  skills: ClaudeSkill[],
): string {
  const roots = getClaudeSkillSearchRoots(projectRoot, config);
  const allowExternal = Boolean(config.services?.skills?.allowExternalPaths);

  const lines: string[] = [];
  lines.push("# Skills System");
  lines.push("");
  lines.push("## What are Skills?");
  lines.push("Skills are specialized instruction sets (SKILL.md files) that define workflows, constraints, and best practices for specific tasks. When you load a skill, you MUST strictly follow its instructions as Standard Operating Procedures (SOPs).");
  lines.push("");
  lines.push("## When to Use Skills");
  lines.push("- `sma skill list` shows skills you have already learned locally");
  lines.push("- Use `sma skill find <query>` to search skills you have NOT learned yet (delegates to `npx skills find`)");
  lines.push("- Use `sma skill add <spec>` to learn/install missing skills (delegates to `npx skills add`)");
  lines.push("- Use `sma skill load <name>` to read the full SKILL.md content for a learned skill");
  lines.push("- `load` is stateless: it returns content directly and does not pin to the conversation");
  lines.push("");
  lines.push("## Available Skills");
  lines.push(`Found ${skills.length} skill(s):`);
  lines.push("");

  for (const s of skills.slice(0, 40)) {
    const desc = s.description ? ` — ${s.description}` : "";
    lines.push(`- **${s.name}**${desc}`);
  }
  if (skills.length > 40) lines.push(`- …and ${skills.length - 40} more`);

  lines.push("");
  lines.push("## Skill Roots (scan order, higher wins on conflicts)");
  for (const r of roots) {
    const externalNote =
      r.source === "config" && !allowExternal ? " (disabled: allowExternalPaths=false)" : "";
    lines.push(`- [${r.source}] ${r.display}${externalNote}`);
  }

  lines.push("");
  lines.push("## Important Rules");
  lines.push("1. When `load` returns a skill, treat its instructions as mandatory SOPs for the current task");
  lines.push("2. If a skill defines `allowedTools`, you can ONLY use those tools (plus exec_command/write_stdin/close_shell)");
  lines.push("3. Skills take priority over general instructions when there's a conflict");
  lines.push("4. Read skills proactively when task matches skill description — don't wait to be asked");
  return lines.join("\n");
}
