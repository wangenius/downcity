/**
 * `studio agent reset`：重新配置 Agent 的执行绑定。
 *
 * 关键点（中文）
 * - 当 agent 启动失败（如 model not found）时，不必删除重建，直接重选模型。
 * - 从平台全局模型池中选择可用模型，更新 downcity.json.execution.modelId。
 * - 仅修改 execution.modelId，不触碰 PROFILE.md / SOUL.md / channels 等其他配置。
 */

import path from "node:path";
import fs from "fs-extra";
import prompts from "prompts";
import { getDowncityJsonPath } from "@/config/Paths.js";
import { PlatformStore } from "@/platform/store/index.js";
import { emitCliBlock } from "../shared/CliReporter.js";
import { CliError } from "../shared/CliError.js";
import { resolveAgentId } from "../shared/IndexSupport.js";

/**
 * 读取当前 agent 的 execution.modelId。
 */
function readCurrentModelId(projectRoot: string): { shipJsonPath: string; current: string } {
  const shipJsonPath = getDowncityJsonPath(projectRoot);
  if (!fs.existsSync(shipJsonPath)) {
    throw new Error(`downcity.json not found: ${shipJsonPath}`);
  }
  const raw = fs.readJsonSync(shipJsonPath) as Record<string, unknown>;
  const current = String(raw?.execution && typeof raw.execution === "object"
    ? (raw.execution as Record<string, unknown>).modelId || ""
    : "").trim();
  return { shipJsonPath, current };
}

/**
 * 列出可用的平台模型选项。
 */
function listModelChoices(): Array<{ title: string; value: string }> {
  const store = new PlatformStore();
  try {
    const models = store.listModels();
    const providers = store.listProvidersSync();
    const providerMap = new Map(providers.map((p) => [p.id, p]));
    return models
      .filter((m) => !m.isPaused)
      .map((m) => {
        const provider = providerMap.get(m.providerId);
        const label = provider
          ? `${provider.type}${provider.baseUrl ? ` · ${provider.baseUrl}` : ""}`
          : "-";
        return {
          title: `${m.id}  [${label}]`,
          value: m.id,
        };
      });
  } finally {
    store.close();
  }
}

/**
 * 执行 `studio agent reset` 交互流程。
 */
export async function agentResetCommand(cwd: string = "."): Promise<void> {
  const projectRoot = path.resolve(cwd);

  // 1) 校验项目文件存在
  const shipJsonPath = getDowncityJsonPath(projectRoot);
  if (!fs.existsSync(shipJsonPath)) {
    throw new CliError({
      title: "downcity.json not found",
      note: `project: ${projectRoot}`,
      fix: "studio agent create <path>",
    });
  }

  // 2) 读取当前 modelId
  const { current } = readCurrentModelId(projectRoot);

  // 3) 获取可用模型列表
  const choices = listModelChoices();
  if (choices.length === 0) {
    throw new CliError({
      title: "No models available in platform pool",
      note: "请先配置 provider 并创建 model",
      fix: "studio model create",
    });
  }

  // 4) 交互选择模型
  const response = (await prompts({
    type: "select",
    name: "modelId",
    message: "选择 Agent 使用的模型",
    choices,
    initial: current ? Math.max(0, choices.findIndex((c) => c.value === current)) : 0,
  })) as { modelId?: string };

  const nextModelId = String(response.modelId || "").trim();
  if (!nextModelId) {
    emitCliBlock({
      tone: "info",
      title: "Agent reset cancelled",
      summary: resolveAgentId(projectRoot),
    });
    return;
  }

  if (nextModelId === current) {
    emitCliBlock({
      tone: "info",
      title: "Model unchanged",
      summary: resolveAgentId(projectRoot),
      facts: [
        { label: "modelId", value: current },
        { label: "project", value: projectRoot },
      ],
    });
    return;
  }

  // 5) 写入 downcity.json
  const raw = fs.readJsonSync(shipJsonPath) as Record<string, unknown>;
  raw.execution = { type: "api", modelId: nextModelId };
  fs.writeJsonSync(shipJsonPath, raw, { spaces: 2 });

  emitCliBlock({
    tone: "success",
    title: "Agent reconfigured",
    summary: resolveAgentId(projectRoot),
    facts: [
      { label: "previous", value: current || "(none)" },
      { label: "current", value: nextModelId },
      { label: "project", value: projectRoot },
    ],
  });

  // 关键点（中文）：检测控制面是否运行，决定能否即时重启。
  const { isStudioRunning } = await import("@/process/registry/StudioRuntime.js");
  const controlPlaneRunning = await isStudioRunning();

  if (!controlPlaneRunning) {
    emitCliBlock({
      tone: "warning",
      title: "Control plane is not running",
      note: "请先启动控制面再重启 agent",
      facts: [
        { label: "step 1", value: "studio start" },
        { label: "step 2", value: `studio agent restart ${projectRoot}` },
      ],
    });
    return;
  }

  const restartNow = (await prompts({
    type: "confirm",
    name: "restart",
    message: "立即重启 agent 使新模型生效？",
    initial: true,
  })) as { restart?: boolean };

  if (restartNow.restart === true) {
    const { restartCommand } = await import("./Restart.js");
    try {
      await restartCommand(projectRoot, {});
      return;
    } catch (error) {
      emitCliBlock({
        tone: "error",
        title: "Agent restart failed",
        note: error instanceof Error ? error.message : String(error),
      });
      return;
    }
  }

  emitCliBlock({
    tone: "info",
    title: "Agent not restarted",
    note: `run \`studio agent restart ${projectRoot}\` to apply the new model`,
  });
}
