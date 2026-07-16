/**
 * Skill 安装命令 helper。
 *
 * 设计目标（中文）
 * - 不自建 registry，直接复用社区的 `npx skills` 安装生态。
 * - 当前 helper 由需要准备 skill 依赖的其他 plugin 复用，不作为 SkillPlugin action 暴露。
 */

import { execa } from "execa";

async function runNpxSkills(args: string[], opts?: { yes?: boolean }): Promise<number> {
  const yes = opts?.yes !== false;
  const result = await execa("npx", [yes ? "-y" : "", "skills", ...args].filter(Boolean), {
    stdio: "inherit",
  });
  return result.exitCode ?? 0;
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
  const agent = String(options.agent || "").trim();
  if (agent) args.push("--agent", agent);

  const yes = options.yes !== false;
  if (yes) args.push("-y");

  const globalInstall = options.global !== false;
  if (globalInstall) args.push("-g");

  await runNpxSkills(args, { yes });
}
