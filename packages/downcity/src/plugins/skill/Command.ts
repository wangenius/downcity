/**
 * `city skill` 命令 helper。
 *
 * 设计目标（中文）
 * - 尽量不自建 registry：直接复用社区的 `npx skills` 生态（find/install）。
 * - 同时提供本地视角的 `list`：列出 Downcity 当前能发现的 skills（含 project/home）。
 */

import path from "node:path";
import fs from "fs-extra";
import { execa } from "execa";
import { discoverClaudeSkillsSync } from "@/plugins/skill/runtime/Discovery.js";
import { getClaudeSkillSearchRoots } from "@/plugins/skill/runtime/Paths.js";
import { loadDowncityConfig } from "@/main/env/Config.js";

async function runNpxSkills(args: string[], opts?: { yes?: boolean }): Promise<number> {
  const yes = opts?.yes !== false;
  const result = await execa("npx", [yes ? "-y" : "", "skills", ...args].filter(Boolean), {
    stdio: "inherit",
  });
  return result.exitCode ?? 0;
}

/**
 * 执行远程 skill 查找。
 */
export async function skillFindCommand(query: string): Promise<void> {
  const q = String(query || "").trim();
  if (!q) throw new Error("Missing query");
  await runNpxSkills(["find", q], { yes: true });
}

/**
 * skill 安装选项。
 */
export interface SkillInstallOptions {
  /**
   * 是否执行全局安装。
   */
  global?: boolean;
  /**
   * 是否跳过交互确认。
   */
  yes?: boolean;
  /**
   * 安装目标 agent 名称。
   */
  agent?: string;
}

/**
 * 安装指定 skill。
 */
export async function skillInstallCommand(
  spec: string,
  options: SkillInstallOptions = {},
): Promise<void> {
  const s = String(spec || "").trim();
  if (!s) throw new Error("Missing spec");

  const args: string[] = ["add", s];
  const agent = String(options.agent || "claude-code").trim();
  if (agent) args.push("--agent", agent);

  const yes = options.yes !== false;
  if (yes) args.push("-y");

  const globalInstall = options.global !== false;
  if (globalInstall) args.push("-g");

  await runNpxSkills(args, { yes });
}

/**
 * 输出当前项目的本地 skill 列表。
 */
export async function skillListCommand(cwd: string = "."): Promise<void> {
  const projectRoot = path.resolve(String(cwd || "."));
  const shipJson = path.join(projectRoot, "downcity.json");
  if (!fs.existsSync(shipJson)) {
    throw new Error(
      `downcity.json not found at ${shipJson}. Run "city agent create" first or pass the correct path.`,
    );
  }

  const config = loadDowncityConfig(projectRoot);
  const roots = getClaudeSkillSearchRoots(projectRoot, config);
  const skills = discoverClaudeSkillsSync(projectRoot, config);

  console.log("Skill roots:");
  for (const root of roots) console.log(`- [${root.source}] ${root.display}`);

  console.log(`\nFound: ${skills.length}`);
  for (const skill of skills) {
    const desc = skill.description ? ` — ${skill.description}` : "";
    console.log(`- [${skill.source}] ${skill.id}: ${skill.name}${desc}`);
  }
}
