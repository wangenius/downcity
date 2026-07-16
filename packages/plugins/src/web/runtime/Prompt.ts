/**
 * WebPlugin 安装提示词渲染器。
 *
 * 关键点（中文）
 * - 只生成 Agent 可执行的操作说明，不执行命令、访问网络或修改文件。
 * - Skill 安装委托给 SkillPlugin，避免重复维护扫描根与安装位置规则。
 * - agent-browser CLI 仅根据请求的作用域提供 Shell 命令候选。
 */

import type {
  WebPluginInstallInstructions,
  WebPluginInstallPayload,
  WebPluginInstallScope,
  WebPluginInstallTarget,
} from "@/web/types/WebPlugin.js";

/**
 * 归一化联网能力目标。
 */
function resolve_install_target(
  target: WebPluginInstallPayload["target"],
): WebPluginInstallTarget {
  return target === "agent-browser" || target === "all"
    ? target
    : "web-access";
}

/**
 * 归一化 CLI 安装作用域。
 */
function resolve_install_scope(
  scope: WebPluginInstallPayload["scope"],
): WebPluginInstallScope {
  return scope === "project" ? "project" : "user";
}

/**
 * 渲染单个 Skill 的安装工作流。
 */
function render_skill_install_step(skill_name: string): string {
  return [
    `- Call \`plugin_call({ plugin: "skill", action: "install", payload: { spec: "${skill_name}" } })\`.`,
    "  Follow the returned scan-aware Shell instructions. The WebPlugin has not installed this Skill.",
  ].join("\n");
}

/**
 * 渲染 agent-browser CLI 的安装提示。
 */
function render_agent_browser_cli_step(scope: WebPluginInstallScope): string {
  if (scope === "project") {
    return [
      "- Inspect the project lockfile and use its existing package manager to install `agent-browser` as a devDependency:",
      "  - pnpm: `pnpm add -D agent-browser`",
      "  - npm: `npm install -D agent-browser`",
      "  - yarn: `yarn add -D agent-browser`",
      "- Verify the project-local CLI with the matching package-manager command, for example `pnpm exec agent-browser --help`.",
    ].join("\n");
  }

  return [
    "- Install the CLI globally with `npm install -g agent-browser`.",
    "- Verify it with `agent-browser --help`.",
  ].join("\n");
}

/**
 * 生成 web install action 返回的纯提示词。
 */
export function render_web_install_prompt(
  payload: WebPluginInstallPayload | null | undefined,
): WebPluginInstallInstructions {
  const target = resolve_install_target(payload?.target);
  const scope = resolve_install_scope(payload?.scope);
  const skill_names =
    target === "all" ? ["web-access", "agent-browser"] : [target];
  const skill_steps = skill_names.map(render_skill_install_step).join("\n");
  const cli_steps =
    target === "agent-browser" || target === "all"
      ? ["", "## agent-browser CLI", render_agent_browser_cli_step(scope)]
      : [];

  const prompt = [
    "# Install Web Capabilities Instructions",
    "",
    "This action only returns instructions. It has not executed commands, accessed the network, installed dependencies, or changed files.",
    "",
    "## Skills",
    skill_steps,
    ...cli_steps,
    "",
    "## Verification",
    "After completing the Shell steps, call `plugin_call({ plugin: \"skill\", action: \"list\", payload: {} })` and confirm every requested Skill is discoverable.",
    "Call `skill.lookup` for each installed Skill before using it.",
    "If the `skill` plugin is unavailable, configure it before installing a Skill; do not guess an unscanned destination.",
  ].join("\n");

  return { kind: "instructions", target, scope, prompt };
}
