/**
 * Agent 项目初始化模块。
 *
 * 职责说明（中文）
 * - CLI `city agent create` 与 Console 共用同一套初始化逻辑，避免模板与目录结构分叉。
 * - 负责创建项目骨架、静态 prompt、默认 `downcity.json`、基础目录与 schema 文件。
 * - 负责把用户在创建阶段提供的最小执行配置与渠道配置写入项目。
 *
 * 边界说明（中文）
 * - 这里只处理“初始化一个新项目”所需的静态文件与目录，不处理 daemon 启停。
 * - 这里只校验项目创建阶段依赖的最小平台条件，不承担后续运行时配置合并职责。
 */

import fs from "fs-extra";
import path from "node:path";
import {
  getCacheDirPath,
  getDowncityAgentsRootDirPath,
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
  getDowncityTasksDirPath,
  getSoulMdPath,
} from "@/config/Paths.js";
import { DEFAULT_DOWNCITY_JSON } from "@/config/Defaults.js";
import { DOWNCITY_JSON_SCHEMA } from "@/config/DowncitySchema.js";
import type { DowncityConfig } from "@/config/Config.js";
import type { DowncityChatPluginChannelsConfig } from "@/types/config/DowncityConfig.js";
import {
  DEFAULT_PROFILE_MD_TEMPLATE,
  DEFAULT_SOUL_MD_TEMPLATE,
} from "@executor/composer/system/default/InitPrompts.js";
import type { EnvFileEntry } from "@/types/common/EnvFile.js";
import { appendMissingEnvEntries } from "@/config/EnvFile.js";
import { ensureGitignoreEntry } from "@/config/Gitignore.js";
import { renderTemplateVariables } from "@/utils/Template.js";
import { ensureDir, saveJson } from "@/utils/storage/index.js";
import type {
  AgentProjectChannel,
  AgentProjectInitializationInput,
  AgentProjectInitializationResult,
} from "@/types/config/AgentProject.js";
import { assertProjectExecutionTarget } from "@/config/ExecutionBinding.js";
import type { ExecutionBindingConfig } from "@/types/config/ExecutionBinding.js";

/**
 * 规范化默认 Agent 名称。
 *
 * 关键点（中文）
 * - 把目录名中的 `_` / `-` 统一折叠为空格，产出更适合作为展示名的默认值。
 * - 这里只做轻量字符串清洗，不负责长度限制或唯一性处理。
 */
export function normalizeDefaultAgentName(input: string): string {
  return String(input || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 规范化用户选择的渠道列表。
 *
 * 关键点（中文）
 * - 只保留当前 agent 初始化流程支持的渠道。
 * - 会自动去重并统一为小写，避免调用方在外部重复做清洗。
 */
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
 *
 * 关键点（中文）
 * - 当前只检查 `PROFILE.md` 与 `downcity.json`，用于快速判断是否已初始化过。
 * - 不把 `.downcity/` 目录作为硬性条件，避免用户手动清理缓存后被误判为未初始化。
 */
export async function isAgentProjectInitialized(projectRoot: string): Promise<boolean> {
  const normalizedRoot = path.resolve(String(projectRoot || "").trim() || ".");
  const profileReady = await fs.pathExists(getProfileMdPath(normalizedRoot));
  const shipReady = await fs.pathExists(getDowncityJsonPath(normalizedRoot));
  return profileReady && shipReady;
}

/**
 * 初始化 agent 项目骨架。
 *
 * 关键点（中文）
 * - 会创建 prompt 文件、配置文件、`.downcity` 目录结构以及 schema 快照。
 * - 对已存在文件采取“能跳过就跳过、明确冲突则报错”的策略，降低误覆盖风险。
 * - 返回结果只描述本次初始化写入摘要，方便 CLI 与控制台直接展示。
 */
export async function initializeAgentProject(
  input: AgentProjectInitializationInput,
): Promise<AgentProjectInitializationResult> {
  const projectRoot = path.resolve(String(input.projectRoot || "").trim() || ".");
  const projectBaseName = path.basename(projectRoot);
  const fallbackAgentName = normalizeDefaultAgentName(projectBaseName) || projectBaseName;
  const agentName = String(input.agentName || "").trim() || fallbackAgentName;
  const execution = input.execution as ExecutionBindingConfig;

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

  const channelsConfig: DowncityChatPluginChannelsConfig = {};
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
      ...(input.plugins || {}),
    },
    ...(Object.keys(channelsConfig).length > 0
      ? {
          plugins: {
            chat: {
              channels: channelsConfig,
            },
          },
        }
      : {}),
  };
  await saveJson(shipJsonPath, shipConfig);
  createdFiles.push("downcity.json");

  await appendMissingEnvEntries(
    dotEnvPath,
    "Downcity Create",
    [] satisfies EnvFileEntry[],
  );
  await appendMissingEnvEntries(
    dotEnvExamplePath,
    "Downcity Create Example",
    [] satisfies EnvFileEntry[],
  );

  const gitignoreStatus = await ensureGitignoreEntry(projectRoot, ".downcity");
  if (gitignoreStatus === "created" || gitignoreStatus === "updated") {
    createdFiles.push(".gitignore");
  } else {
    skippedFiles.push(".gitignore");
  }

  const dirs = [
    getDowncityDirPath(projectRoot),
    getDowncityTasksDirPath(projectRoot),
    getLogsDirPath(projectRoot),
    getCacheDirPath(projectRoot),
    getDowncityProfileDirPath(projectRoot),
    getDowncityDataDirPath(projectRoot),
    getDowncityAgentsRootDirPath(projectRoot),
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
    ...(execution?.type === "api" && String(execution.modelId || "").trim()
      ? { modelId: String(execution.modelId || "").trim() }
      : {}),
    channels,
    createdFiles,
    skippedFiles,
  };
}
