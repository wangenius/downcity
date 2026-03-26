/**
 * Skills prompt section 渲染器。
 *
 * 关键点（中文）
 * - 仅负责渲染运行时动态清单（已发现 skills + 扫描根目录）。
 * - 稳定规则放在 `services/skills/PROMPT.txt`，避免分散在代码里维护。
 * - 仅做字符串渲染，不做文件 IO。
 */

import type { DowncityConfig } from "@/console/env/Config.js";
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
  config: DowncityConfig,
  skills: ClaudeSkill[],
): string {
  const roots = getClaudeSkillSearchRoots(projectRoot, config);
  const allowExternal = Boolean(config.services?.skills?.allowExternalPaths);

  const skillsSection =
    skills.length > 0
      ? skills
          .map((skill) => {
            const desc = skill.description ? ` - ${skill.description}` : "";
            return `- **${skill.name}**${desc}`;
          })
          .join("\n")
      : "- (none)";

  const rootsSection =
    roots.length > 0
      ? roots
          .map((root) => {
            const externalNote =
              root.source === "config" && !allowExternal
                ? " (disabled: allowExternalPaths=false)"
                : "";
            return `- [${root.source}] ${root.display}${externalNote}`;
          })
          .join("\n")
      : "- (none)";

  return [
    "# Runtime Skills Inventory",
    "",
    `Discovered ${skills.length} learned/installed skill(s).`,
    "All skills in `Available Skills` are already available locally.",
    "",
    "## Available Skills",
    skillsSection,
    "",
    "## Skill Roots (scan order, higher wins on conflicts)",
    rootsSection,
  ]
    .filter(Boolean)
    .join("\n");
}
