/**
 * AgentInitializer：创建/初始化 agent 项目的复用模块。
 *
 * 关键点（中文）
 * - CLI `city agent create` 与 Console 共用同一套初始化逻辑，避免模板与目录结构分叉。
 * - 只负责项目骨架与配置文件，不处理 daemon 启停。
 */

import fs from "fs-extra";
import path from "node:path";
import {
  getCacheDirPath,
  getLogsDirPath,
  getProfileMdPath,
  getDowncityConfigDirPath,
  getDowncityDataDirPath,
  getDowncityDebugDirPath,
  getDowncityDirPath,
  getDowncityJsonPath,
  getDowncityProfileDirPath,
  getDowncityProfileOtherPath,
  getDowncityProfilePrimaryPath,
  getDowncityPublicDirPath,
  getDowncitySchemaPath,
  getDowncitySessionRootDirPath,
  getDowncityTasksDirPath,
  getSoulMdPath,
} from "@/main/city/env/Paths.js";
import { DEFAULT_DOWNCITY_JSON } from "@/shared/constants/DowncityDefault.js";
import { DOWNCITY_JSON_SCHEMA } from "@/shared/constants/DowncitySchema.js";
import type { DowncityConfig } from "@/main/city/env/Config.js";
import {
  DEFAULT_PROFILE_MD_TEMPLATE,
  DEFAULT_SOUL_MD_TEMPLATE,
} from "@session/prompts/common/InitPrompts.js";
import { renderTemplateVariables } from "@/shared/utils/Template.js";
import { ensureDir, saveJson } from "@/shared/utils/storage/index.js";
import { ConsoleStore } from "@/shared/utils/store/index.js";
import type {
  AgentProjectChannel,
  AgentProjectInitializationInput,
  AgentProjectInitializationResult,
} from "@/shared/types/AgentProject.js";
import { assertProjectExecutionTarget } from "@/main/agent/project/ProjectExecutionBinding.js";
import type { ExecutionBindingConfig } from "@/shared/types/ExecutionBinding.js";

/**
 * Console 模型选项。
 */
export interface ConsoleModelChoice {
  /**
   * 下拉展示文案。
   */
  title: string;

  /**
   * 模型 ID。
   */
  value: string;
}

type EnvEntry = {
  key: string;
  value: string;
};

/**
 * 规范化默认 Agent 名称。
 */
export function normalizeDefaultAgentName(input: string): string {
  return String(input || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 读取 console 全局模型选项。
 */
export async function listConsoleModelChoices(): Promise<ConsoleModelChoice[]> {
  const store = new ConsoleStore();
  try {
    const models = store.listModels();
    const providers = await store.listProviders();
    const providerMap = new Map(providers.map((item) => [item.id, item] as const));
    return models
      .map((item) => {
        const id = String(item.id || "").trim();
        if (!id) return null;
        const providerId = String(item.providerId || "").trim();
        const providerType = String(providerMap.get(providerId)?.type || "").trim();
        const providerLabel = providerId
          ? providerType
            ? `${providerId} (${providerType})`
            : providerId
          : "-";
        return {
          title: `${id} · ${providerLabel}`,
          value: id,
        };
      })
      .filter((item): item is ConsoleModelChoice => item !== null);
  } finally {
    store.close();
  }
}

function parseEnvKeys(content: string): Set<string> {
  const out = new Set<string>();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = String(rawLine || "").trim();
    if (!line || line.startsWith("#")) continue;
    const matched = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!matched) continue;
    out.add(matched[1]);
  }
  return out;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 仅追加缺失 env 项。
 */
async function appendMissingEnvEntries(params: {
  filePath: string;
  sectionTitle: string;
  entries: EnvEntry[];
  overwriteKeys?: Set<string>;
}): Promise<void> {
  const filePath = String(params.filePath || "").trim();
  if (!filePath) return;
  const entries = Array.isArray(params.entries)
    ? params.entries.filter((item) => Boolean(String(item?.key || "").trim()))
    : [];
  const overwriteKeys = params.overwriteKeys || new Set<string>();

  let existing = "";
  if (await fs.pathExists(filePath)) {
    existing = await fs.readFile(filePath, "utf-8");
  }
  const existingKeys = parseEnvKeys(existing);
  let nextContent = existing;
  const appendedEntries: EnvEntry[] = [];

  for (const entry of entries) {
    if (!existingKeys.has(entry.key)) {
      appendedEntries.push(entry);
      continue;
    }
    if (!overwriteKeys.has(entry.key)) continue;
    const linePattern = new RegExp(`^${escapeRegExp(entry.key)}\\s*=.*$`, "gm");
    if (linePattern.test(nextContent)) {
      nextContent = nextContent.replace(linePattern, `${entry.key}=${entry.value}`);
    }
  }

  if (appendedEntries.length > 0) {
    const lines: string[] = [];
    if (!nextContent.trim()) {
      lines.push("# Downcity 环境变量");
    }
    lines.push("", `# ${params.sectionTitle}`);
    for (const entry of appendedEntries) {
      lines.push(`${entry.key}=${entry.value}`);
    }
    let chunk = lines.join("\n");
    if (nextContent && !nextContent.endsWith("\n")) {
      chunk = `\n${chunk}`;
    }
    nextContent = `${nextContent}${chunk}\n`;
  }

  if (appendedEntries.length > 0 || !(await fs.pathExists(filePath))) {
    await fs.writeFile(filePath, nextContent, "utf-8");
  }
}

/**
 * 校验主模型可用。
 */
function assertPrimaryModelReady(primaryModelId: string): void {
  const normalizedModelId = String(primaryModelId || "").trim();
  if (!normalizedModelId) {
    throw new Error("execution.modelId is required");
  }

  const store = new ConsoleStore();
  try {
    const model = store.getModel(normalizedModelId);
    if (!model) {
      throw new Error(`Model not found in console model pool: ${normalizedModelId}`);
    }
    if (model.isPaused === true) {
      throw new Error(`Model is paused: ${normalizedModelId}`);
    }
  } finally {
    store.close();
  }
}

function normalizeChannels(input: AgentProjectChannel[] | undefined): AgentProjectChannel[] {
  const allowed = new Set<AgentProjectChannel>(["telegram", "feishu", "qq"]);
  const seen = new Set<AgentProjectChannel>();
  for (const item of Array.isArray(input) ? input : []) {
    const value = String(item || "").trim().toLowerCase() as AgentProjectChannel;
    if (!allowed.has(value)) continue;
    seen.add(value);
  }
  return [...seen];
}

/**
 * 判断项目是否已经具备最小初始化文件。
 */
export async function isAgentProjectInitialized(projectRoot: string): Promise<boolean> {
  const normalizedRoot = path.resolve(String(projectRoot || "").trim() || ".");
  const profileReady = await fs.pathExists(getProfileMdPath(normalizedRoot));
  const shipReady = await fs.pathExists(getDowncityJsonPath(normalizedRoot));
  return profileReady && shipReady;
}

/**
 * 初始化 agent 项目骨架。
 */
export async function initializeAgentProject(
  input: AgentProjectInitializationInput,
): Promise<AgentProjectInitializationResult> {
  const projectRoot = path.resolve(String(input.projectRoot || "").trim() || ".");
  const projectBaseName = path.basename(projectRoot);
  const fallbackAgentName = normalizeDefaultAgentName(projectBaseName) || projectBaseName;
  const agentName = String(input.agentName || "").trim() || fallbackAgentName;
  const execution = input.execution as ExecutionBindingConfig;
  const executionMode = String(execution?.type || "").trim();
  const primaryModelId =
    executionMode === "model"
      ? String((execution as ExecutionBindingConfig & { modelId?: string }).modelId || "").trim()
      : "";
  const sessionAgentType =
    executionMode === "acp"
      ? String((execution as ExecutionBindingConfig & { agent?: { type?: string } }).agent?.type || "").trim()
      : "";
  const channels = normalizeChannels(input.channels);
  const dotEnvPath = path.join(projectRoot, ".env");
  const dotEnvExamplePath = path.join(projectRoot, ".env.example");
  const createdFiles: string[] = [];
  const skippedFiles: string[] = [];

  assertProjectExecutionTarget({
    name: agentName,
    version: "1.0.0",
    execution,
  });
  if (primaryModelId) {
    const consoleModelChoices = await listConsoleModelChoices();
    if (consoleModelChoices.length === 0) {
      throw new Error("Console model pool is empty. Please configure at least one model first.");
    }
    assertPrimaryModelReady(primaryModelId);
  }

  await ensureDir(projectRoot);

  const profileMdPath = getProfileMdPath(projectRoot);
  const soulMdPath = getSoulMdPath(projectRoot);
  const shipJsonPath = getDowncityJsonPath(projectRoot);
  const existingShipJson = await fs.pathExists(shipJsonPath);
  if (existingShipJson && input.forceOverwriteShipJson !== true) {
    throw new Error(`downcity.json already exists: ${shipJsonPath}`);
  }

  const initTemplateVariables = {
    agent_name: agentName,
  };
  const staticPromptFiles = [
    {
      filename: "PROFILE.md",
      filePath: profileMdPath,
      content: renderTemplateVariables(DEFAULT_PROFILE_MD_TEMPLATE, initTemplateVariables),
    },
    {
      filename: "SOUL.md",
      filePath: soulMdPath,
      content: renderTemplateVariables(DEFAULT_SOUL_MD_TEMPLATE, initTemplateVariables),
    },
  ] as const;

  for (const file of staticPromptFiles) {
    if (await fs.pathExists(file.filePath)) {
      skippedFiles.push(file.filename);
      continue;
    }
    await fs.writeFile(file.filePath, file.content, "utf-8");
    createdFiles.push(file.filename);
  }

  const channelsConfig: NonNullable<
    NonNullable<NonNullable<DowncityConfig["services"]>["chat"]>["channels"]
  > = {};
  if (channels.includes("telegram")) {
    channelsConfig.telegram = { enabled: true };
  }
  if (channels.includes("feishu")) {
    channelsConfig.feishu = { enabled: true };
  }
  if (channels.includes("qq")) {
    channelsConfig.qq = { enabled: true };
  }

  const shipConfig: DowncityConfig = {
    $schema: DEFAULT_DOWNCITY_JSON.$schema,
    name: agentName,
    version: "1.0.0",
    execution,
    plugins: {
      skill: {
        enabled: true,
        paths: [".agents/skills"],
        allowExternalPaths: false,
      },
    },
    ...(Object.keys(channelsConfig).length > 0
      ? {
          services: {
            chat: {
              channels: channelsConfig,
            },
          },
        }
      : {}),
  };
  await saveJson(shipJsonPath, shipConfig);
  createdFiles.push("downcity.json");

  await appendMissingEnvEntries({
    filePath: dotEnvPath,
    sectionTitle: "Downcity Create",
    entries: [],
  });
  await appendMissingEnvEntries({
    filePath: dotEnvExamplePath,
    sectionTitle: "Downcity Create Example",
    entries: [],
  });

  const dirs = [
    getDowncityDirPath(projectRoot),
    getDowncityTasksDirPath(projectRoot),
    getLogsDirPath(projectRoot),
    getCacheDirPath(projectRoot),
    getDowncityProfileDirPath(projectRoot),
    getDowncityDataDirPath(projectRoot),
    getDowncitySessionRootDirPath(projectRoot),
    getDowncityPublicDirPath(projectRoot),
    getDowncityConfigDirPath(projectRoot),
    path.join(projectRoot, ".agents", "skills"),
    path.join(getDowncityDirPath(projectRoot), "schema"),
    getDowncityDebugDirPath(projectRoot),
  ];
  for (const dir of dirs) {
    await ensureDir(dir);
  }

  const shipSchemaPath = getDowncitySchemaPath(projectRoot);
  await ensureDir(path.dirname(shipSchemaPath));
  await saveJson(shipSchemaPath, DOWNCITY_JSON_SCHEMA);
  createdFiles.push(".downcity/schema/downcity.schema.json");

  try {
    await ensureDir(getDowncityProfileDirPath(projectRoot));
    await fs.ensureFile(getDowncityProfilePrimaryPath(projectRoot));
    await fs.ensureFile(getDowncityProfileOtherPath(projectRoot));
  } catch {
    // ignore optional profile memory bootstrap errors
  }

  return {
    projectRoot,
    agentName,
    executionMode: execution.type,
    ...(primaryModelId ? { modelId: primaryModelId } : {}),
    ...(sessionAgentType ? { agentType: sessionAgentType as "codex" | "claude" | "kimi" } : {}),
    channels,
    createdFiles,
    skippedFiles,
  };
}
