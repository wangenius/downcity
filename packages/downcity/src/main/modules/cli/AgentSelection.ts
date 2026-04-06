/**
 * agent 列表与交互式选择辅助模块。
 *
 * 关键点（中文）
 * - 统一承接 `city agent list` 的 registry 展示逻辑。
 * - 统一承接 `city agent start` 在省略路径时的目标选择逻辑。
 * - 规则固定为：显式路径优先，其次当前目录已初始化，最后才进入交互选择。
 */

import { existsSync } from "fs";
import { resolve } from "path";
import prompts from "prompts";
import { getDowncityJsonPath, getProfileMdPath } from "@/main/city/env/Paths.js";
import { listConsoleAgents } from "@/main/city/runtime/CityRegistry.js";
import type { ConsoleAgentRegistryEntry } from "@/shared/types/Console.js";
import type {
  CliAgentPromptChoice,
  CliRegisteredAgentView,
  ResolveCliAgentStartTargetDecision,
  ResolveCliAgentStartTargetDecisionInput,
} from "@/types/cli/AgentSelection.js";
import { emitCliBlock, emitCliList } from "./CliReporter.js";
import { resolveAgentName } from "./IndexSupport.js";
import { resolveRunningConsoleAgents } from "./IndexConsoleProcess.js";

/**
 * 判断一个目录是否已经满足最小 agent 初始化条件。
 */
function isInitializedAgentProject(projectRoot: string): boolean {
  return existsSync(getProfileMdPath(projectRoot)) && existsSync(getDowncityJsonPath(projectRoot));
}

/**
 * 将 registry entry 转换为 CLI 展示视图。
 */
function toCliRegisteredAgentView(
  entry: ConsoleAgentRegistryEntry,
): CliRegisteredAgentView {
  const projectRoot = resolve(String(entry.projectRoot || "").trim() || ".");
  return {
    name: resolveAgentName(projectRoot),
    projectRoot,
    status: entry.status === "stopped" ? "stopped" : "running",
  };
}

/**
 * 读取当前 registry 中的已登记 agent 列表。
 */
export async function listRegisteredAgentsForCli(): Promise<CliRegisteredAgentView[]> {
  const entries = await listConsoleAgents();
  const runningViews = await resolveRunningConsoleAgents({
    syncRegistry: false,
  });
  const runningProjectRoots = new Set(
    runningViews.map((item) => resolve(String(item.projectRoot || "").trim() || ".")),
  );
  return entries
    .map((entry) => {
      const view = toCliRegisteredAgentView(entry);
      return {
        ...view,
        status: runningProjectRoots.has(view.projectRoot) ? "running" : "stopped",
      } satisfies CliRegisteredAgentView;
    })
    .sort((left, right) =>
      left.name.localeCompare(right.name) || left.projectRoot.localeCompare(right.projectRoot),
    );
}

/**
 * 构建交互式选择器的 choices。
 */
export function buildCliAgentPromptChoices(
  agents: CliRegisteredAgentView[],
): CliAgentPromptChoice[] {
  return agents.map((agent) => ({
    title: agent.name,
    value: agent.projectRoot,
    description: `${agent.status} · ${agent.projectRoot}`,
  }));
}

/**
 * 解析 `agent start` 在当前上下文下应该如何决定目标目录。
 */
export function resolveCliAgentStartTargetDecision(
  input: ResolveCliAgentStartTargetDecisionInput,
): ResolveCliAgentStartTargetDecision {
  const explicitPath = String(input.pathInput || "").trim();
  if (explicitPath) {
    return {
      mode: "explicit",
      projectRoot: resolve(explicitPath),
    };
  }

  const currentWorkingDirectory = resolve(input.currentWorkingDirectory || ".");
  if (input.currentDirectoryInitialized) {
    return {
      mode: "current",
      projectRoot: currentWorkingDirectory,
    };
  }

  if (input.registeredAgents.length === 0) {
    return {
      mode: "error",
      reason: "no-registered-agents",
    };
  }

  if (!input.interactive) {
    return {
      mode: "error",
      reason: "non-interactive",
    };
  }

  return {
    mode: "prompt",
  };
}

/**
 * 通过终端交互让用户选择一个已登记 agent。
 */
async function promptRegisteredAgentProjectRoot(
  agents: CliRegisteredAgentView[],
): Promise<string | null> {
  const response = (await prompts({
    type: "select",
    name: "projectRoot",
    message: "选择要启动的 Agent",
    choices: buildCliAgentPromptChoices(agents),
    initial: 0,
  })) as { projectRoot?: string };

  const projectRoot = String(response.projectRoot || "").trim();
  return projectRoot || null;
}

/**
 * 输出已登记 agent 列表。
 */
export async function emitRegisteredAgentList(): Promise<void> {
  const agents = await listRegisteredAgentsForCli();
  const filteredAgents = agents;

  if (filteredAgents.length === 0) {
    emitCliBlock({
      tone: "info",
      title: "Agents",
      summary: "0 registered",
      note: "Run `city agent start <path>` once to register an agent with city.",
    });
    return;
  }

  emitCliList({
    tone: "accent",
    title: "Agents",
    summary: `${filteredAgents.length} registered`,
    items: filteredAgents.map((agent) => ({
      tone: agent.status === "running" ? "success" : "info",
      title: agent.name,
      facts: [
        {
          label: "Project",
          value: agent.projectRoot,
        },
        {
          label: "Status",
          value: agent.status,
        },
      ],
    })),
  });
}

/**
 * 输出已登记 agent 列表，可选仅显示运行中项目。
 */
export async function emitRegisteredAgentListWithOptions(options?: {
  /**
   * 是否只输出当前运行中的 agent。
   */
  runningOnly?: boolean;
  /**
   * 是否以 JSON 输出。
   */
  asJson?: boolean;
}): Promise<void> {
  const allAgents = await listRegisteredAgentsForCli();
  const agents = options?.runningOnly === true
    ? allAgents.filter((item) => item.status === "running")
    : allAgents;

  if (options?.asJson === true) {
    console.log(JSON.stringify({
      success: true,
      count: agents.length,
      runningOnly: options.runningOnly === true,
      agents,
    }, null, 2));
    return;
  }

  if (agents.length === 0) {
    emitCliBlock({
      tone: "info",
      title: options?.runningOnly === true ? "Running agents" : "Agents",
      summary: options?.runningOnly === true ? "0 running" : "0 registered",
      note: options?.runningOnly === true
        ? "No agent daemon is currently running."
        : "Run `city agent start <path>` once to register an agent with city.",
    });
    return;
  }

  emitCliList({
    tone: "accent",
    title: options?.runningOnly === true ? "Running agents" : "Agents",
    summary: options?.runningOnly === true
      ? `${agents.length} running`
      : `${agents.length} registered`,
    items: agents.map((agent) => ({
      tone: agent.status === "running" ? "success" : "info",
      title: agent.name,
      facts: [
        {
          label: "Project",
          value: agent.projectRoot,
        },
        {
          label: "Status",
          value: agent.status,
        },
      ],
    })),
  });
}

/**
 * 为 `city agent start` 解析最终要启动的项目目录。
 */
export async function resolveCliAgentStartProjectRoot(
  pathInput?: string,
): Promise<string | null> {
  const currentWorkingDirectory = resolve(process.cwd());
  const registeredAgents = await listRegisteredAgentsForCli();
  const decision = resolveCliAgentStartTargetDecision({
    pathInput,
    currentWorkingDirectory,
    currentDirectoryInitialized: isInitializedAgentProject(currentWorkingDirectory),
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    registeredAgents,
  });

  if (decision.mode === "explicit" || decision.mode === "current") {
    return decision.projectRoot;
  }

  if (decision.mode === "error") {
    if (decision.reason === "no-registered-agents") {
      emitCliBlock({
        tone: "error",
        title: "No registered agents",
        note: "Run `city agent start <path>` to start and register an agent first.",
      });
      return null;
    }

    emitCliBlock({
      tone: "error",
      title: "Agent path is required",
      note: "Use `city agent start <path>` or run this command in an interactive terminal.",
    });
    return null;
  }

  const selectedProjectRoot = await promptRegisteredAgentProjectRoot(registeredAgents);
  if (!selectedProjectRoot) {
    emitCliBlock({
      tone: "info",
      title: "Agent start cancelled",
    });
    return null;
  }

  return selectedProjectRoot;
}
