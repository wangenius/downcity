/**
 * `city agent reset`：重新配置 Agent 的执行绑定。
 *
 * 关键点（中文）
 * - 当 agent 启动失败（如 model not found）时，不必删除重建，直接重选模型。
 * - 从 console 全局模型池中选择可用模型，更新 downcity.json.execution.modelId。
 * - 仅修改 execution.modelId，不触碰 PROFILE.md / SOUL.md / channels 等其他配置。
 */

import path from "node:path";
import fs from "fs-extra";
import prompts from "prompts";
import { getDowncityJsonPath } from "@/config/Paths.js";
import { ConsoleStore } from "@/shared/utils/store/index.js";
import { emitCliBlock } from "./CliReporter.js";
import { resolveAgentName } from "./IndexSupport.js";

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
 * 列出可用的 console 模型选项。
 */
function listModelChoices(): Array<{ title: string; value: string }> {
  const store = new ConsoleStore();
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
 * 执行 `city agent reset` 交互流程。
 */
export async function agentResetCommand(cwd: string = "."): Promise<void> {
  const projectRoot = path.resolve(cwd);

  // 1) 校验项目文件存在
  const shipJsonPath = getDowncityJsonPath(projectRoot);
  if (!fs.existsSync(shipJsonPath)) {
    emitCliBlock({
      tone: "error",
      title: "downcity.json not found",
      summary: projectRoot,
      facts: [{ label: "fix", value: "city agent create <path>" }],
    });
    process.exit(1);
  }

  // 2) 读取当前 modelId
  const { current } = readCurrentModelId(projectRoot);

  // 3) 获取可用模型列表
  const choices = listModelChoices();
  if (choices.length === 0) {
    emitCliBlock({
      tone: "error",
      title: "No models available in console pool",
      summary: "请先配置 provider 并创建 model",
      facts: [
        { label: "fix", value: "city model create" },
        { label: "project", value: projectRoot },
      ],
    });
    process.exit(1);
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
      summary: resolveAgentName(projectRoot),
    });
    return;
  }

  if (nextModelId === current) {
    emitCliBlock({
      tone: "info",
      title: "Model unchanged",
      summary: resolveAgentName(projectRoot),
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
    summary: resolveAgentName(projectRoot),
    facts: [
      { label: "previous", value: current || "(none)" },
      { label: "current", value: nextModelId },
      { label: "project", value: projectRoot },
    ],
  });

  // 关键点（中文）：检测 console 是否运行，决定能否即时重启。
  const { isCityRunning } = await import("@/registry/CityRuntime.js");
  const consoleRunning = await isCityRunning();

  if (!consoleRunning) {
    emitCliBlock({
      tone: "warning",
      title: "Console runtime is not running",
      note: "请先启动 console 再重启 agent",
      facts: [
        { label: "step 1", value: "city start" },
        { label: "step 2", value: `city agent restart ${projectRoot}` },
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
    note: `run \`city agent restart ${projectRoot}\` to apply the new model`,
  });
}
