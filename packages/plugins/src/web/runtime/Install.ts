/**
 * WebPlugin 安装器。
 *
 * 关键点（中文）
 * - install 只负责准备联网相关 skill / CLI 依赖，不写 provider 配置。
 * - skill 安装复用 SkillPlugin 的 `npx skills` 通道，避免 web 自建 registry。
 * - agent-browser 额外准备 npm CLI 包，因为其 skill 需要 `agent-browser` 命令可用。
 */

import { execa } from "execa";
import fs from "node:fs";
import path from "node:path";
import type {
  JsonObject,
  JsonValue,
} from "@downcity/agent/internal/types/common/Json.js";
import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
import { skillInstallCommand } from "@/skill/Command.js";
import type {
  WebPluginInstallPayload,
  WebPluginInstallScope,
  WebPluginInstallTarget,
} from "@/web/types/WebPlugin.js";

/**
 * 单个安装步骤结果。
 */
interface WebPluginInstallStep {
  /**
   * 步骤名称。
   */
  name: string;
  /**
   * 步骤是否成功。
   */
  success: boolean;
  /**
   * 人类可读说明。
   */
  message: string;
}

/**
 * 读取字符串字段。
 */
function read_string(value: JsonValue | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * 读取布尔字段。
 */
function read_boolean(value: JsonValue | undefined): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/**
 * 归一化安装目标。
 */
function resolve_install_target(value: JsonValue | undefined): WebPluginInstallTarget {
  const target = read_string(value);
  if (target === "web-access" || target === "agent-browser" || target === "all") {
    return target;
  }
  return "web-access";
}

/**
 * 归一化安装作用域。
 */
function resolve_install_scope(value: JsonValue | undefined): WebPluginInstallScope {
  const scope = read_string(value);
  return scope === "project" ? "project" : "user";
}

/**
 * 判断命令是否已经可用。
 */
async function command_exists(command: string): Promise<boolean> {
  try {
    const result = await execa(command, ["--help"], {
      reject: false,
      timeout: 15_000,
    });
    return (result.exitCode ?? 1) === 0;
  } catch {
    return false;
  }
}

/**
 * 执行 npm 包安装。
 */
async function install_npm_package(params: {
  root_path: string;
  package_name: string;
  scope: WebPluginInstallScope;
}): Promise<void> {
  if (params.scope === "project") {
    const package_manager = resolve_project_package_manager(params.root_path);
    const args =
      package_manager === "pnpm"
        ? ["add", "-D", params.package_name]
        : package_manager === "yarn"
          ? ["add", "-D", params.package_name]
          : ["install", "--save-dev", params.package_name];
    await execa(package_manager, args, {
      cwd: params.root_path,
      stdio: "inherit",
    });
    return;
  }

  await execa("npm", ["install", "-g", params.package_name], {
    stdio: "inherit",
  });
}

/**
 * 根据锁文件推断项目包管理器。
 */
function resolve_project_package_manager(root_path: string): "pnpm" | "yarn" | "npm" {
  if (fs.existsSync(path.join(root_path, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(root_path, "yarn.lock"))) return "yarn";
  return "npm";
}

/**
 * 将步骤列表转成 JSON。
 */
function serialize_steps(steps: WebPluginInstallStep[]): JsonValue[] {
  return steps.map((step) => ({
    name: step.name,
    success: step.success,
    message: step.message,
  }));
}

/**
 * 安装 skill。
 */
async function install_skill(params: {
  spec: string;
  scope: WebPluginInstallScope;
  yes: boolean;
  agent?: string;
  steps: WebPluginInstallStep[];
}): Promise<void> {
  await skillInstallCommand(params.spec, {
    global: params.scope === "user",
    yes: params.yes,
    agent: params.agent,
  });
  params.steps.push({
    name: `${params.spec}:skill`,
    success: true,
    message:
      params.scope === "user"
        ? `Installed ${params.spec} skill in user scope.`
        : `Installed ${params.spec} skill in project scope.`,
  });
}

/**
 * 准备 agent-browser CLI。
 */
async function install_agent_browser_cli(params: {
  context: AgentContext;
  scope: WebPluginInstallScope;
  steps: WebPluginInstallStep[];
}): Promise<void> {
  if (await command_exists("agent-browser")) {
    params.steps.push({
      name: "agent-browser:cli",
      success: true,
      message: "agent-browser CLI is already available.",
    });
    return;
  }

  await install_npm_package({
    root_path: params.context.rootPath,
    package_name: "agent-browser",
    scope: params.scope,
  });

  params.steps.push({
    name: "agent-browser:cli",
    success: true,
    message:
      params.scope === "user"
        ? "Installed agent-browser CLI globally with npm."
        : "Installed agent-browser as a project devDependency.",
  });
}

/**
 * 执行 WebPlugin install action。
 */
export async function installWebPluginTargets(params: {
  context: AgentContext;
  payload?: WebPluginInstallPayload | null;
}): Promise<JsonObject> {
  const payload = params.payload || {};
  const target = resolve_install_target(payload.target);
  const scope = resolve_install_scope(payload.scope);
  const yes = read_boolean(payload.yes) ?? true;
  const agent = read_string(payload.agent);
  const targets =
    target === "all" ? (["web-access", "agent-browser"] as const) : ([target] as const);
  const steps: WebPluginInstallStep[] = [];

  for (const item of targets) {
    await install_skill({
      spec: item,
      scope,
      yes,
      agent,
      steps,
    });

    if (item === "agent-browser") {
      await install_agent_browser_cli({
        context: params.context,
        scope,
        steps,
      });
    }
  }

  return {
    target,
    scope,
    ...(agent ? { agent } : {}),
    steps: serialize_steps(steps),
    nextAction:
      "Use SkillPlugin lookup/list to inspect installed skills, then let the agent choose the concrete web path during task execution.",
  };
}
