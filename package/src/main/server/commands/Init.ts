/**
 * `sma agent create`：在目标目录生成最小可用的 ShipMyAgent 工程骨架与配置文件。
 *
 * 目标
 * - 生成 `PROFILE.md` / `SOUL.md` / `USER.md` / `ship.json` / `.ship/` 目录结构与 schema 文件
 * - 通过交互式问题收集必要配置（模型、channels 等）
 *
 * 设计要点
 * - Chat channels 支持多选：仅写入用户选择的 channels（未选择的不出现在 `ship.json`）
 * - 避免写入无意义的默认值：能省则省，保持配置简洁
 */

import path from "path";
import prompts from "prompts";
import fs from "fs-extra";
import { execa } from "execa";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  getProfileMdPath,
  getSoulMdPath,
  getUserMdPath,
  getShipJsonPath,
  getShipDirPath,
  getLogsDirPath,
  getCacheDirPath,
  getShipSchemaPath,
  getShipContextRootDirPath,
  getShipConfigDirPath,
  getShipDataDirPath,
  getShipProfileDirPath,
  getShipProfileOtherPath,
  getShipProfilePrimaryPath,
  getShipDebugDirPath,
  getShipPublicDirPath,
  getShipTasksDirPath,
} from "@/main/server/env/Paths.js";
import { ensureDir, saveJson } from "@/utils/storage/index.js";
import type { ShipConfig } from "@/main/server/env/Config.js";
import { SHIP_JSON_SCHEMA } from "@/main/server/constants/ShipSchema.js";
import { DEFAULT_SHIP_JSON } from "@/main/server/constants/Ship.js";
import type { LlmProviderType } from "@main/types/LlmConfig.js";
import {
  DEFAULT_PROFILE_MD_TEMPLATE,
  DEFAULT_SOUL_MD_TEMPLATE,
  DEFAULT_USER_MD_TEMPLATE,
} from "@main/prompts/common/InitPrompts.js";
import { renderTemplateVariables } from "@/utils/Template.js";

type InitPromptResponse = {
  name?: string;
  providerType?: LlmProviderType;
  apiKey?: string;
  modelName?: string;
  baseUrl?: string;
  channels?: string[];
  qqSandbox?: boolean;
  skillsToInstall?: string[];
};

type InitProviderChoice = {
  title: string;
  value: LlmProviderType;
};

type EnvEntry = {
  key: string;
  value: string;
};

const LLM_API_KEY_ENV_KEY = "LLM_API_KEY";
const LLM_MODEL_ENV_KEY = "LLM_MODEL";
const LLM_BASE_URL_ENV_KEY = "LLM_BASE_URL";

const INIT_PROVIDER_CHOICES: InitProviderChoice[] = [
  { title: "OpenAI", value: "openai" },
  { title: "Anthropic", value: "anthropic" },
  { title: "DeepSeek", value: "deepseek" },
  { title: "Gemini", value: "gemini" },
  { title: "Open Compatible", value: "open-compatible" },
  { title: "Open Responses", value: "open-responses" },
  { title: "Moonshot (Kimi)", value: "moonshot" },
  { title: "xAI", value: "xai" },
  { title: "HuggingFace", value: "huggingface" },
  { title: "OpenRouter", value: "openrouter" },
];

const INIT_DEFAULT_MODEL_BY_PROVIDER: Record<LlmProviderType, string> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4o-mini",
  deepseek: "deepseek-chat",
  gemini: "gemini-2.0-flash",
  "open-compatible": "gpt-4o-mini",
  "open-responses": "gpt-4.1-mini",
  moonshot: "moonshot-v1-8k",
  xai: "grok-3-mini",
  huggingface: "meta-llama/Meta-Llama-3.1-8B-Instruct",
  openrouter: "openai/gpt-4o-mini",
};

/**
 * 解析 init 交互中的 provider type。
 *
 * 关键点（中文）
 * - 非法输入回退到 `openai`，避免初始化中断。
 */
function resolveInitProviderType(input: unknown): LlmProviderType {
  const value = String(input || "").trim();
  if (!value) return "openai";
  const found = INIT_PROVIDER_CHOICES.find((item) => item.value === value);
  return found?.value || "openai";
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

function parseEnvValueMap(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = String(rawLine || "").trim();
    if (!line || line.startsWith("#")) continue;
    const matched = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!matched) continue;
    out[matched[1]] = matched[2] ?? "";
  }
  return out;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 仅向 env 文件追加缺失键（不覆盖已有键）。
 *
 * 关键点（中文）
 * - 用户已有的 env 配置永远优先，不会被 init 覆盖。
 * - 仅当键不存在时才追加，满足“原来有就跳过，原来没有就写入”。
 */
async function appendMissingEnvEntries(params: {
  filePath: string;
  sectionTitle: string;
  entries: EnvEntry[];
  overwriteKeys?: Set<string>;
}): Promise<{
  appended: string[];
  overwritten: string[];
  skipped: string[];
}> {
  const filePath = String(params.filePath || "").trim();
  if (!filePath) return { appended: [], overwritten: [], skipped: [] };
  const entries = Array.isArray(params.entries)
    ? params.entries.filter((item) => {
        const key = String(item?.key || "").trim();
        return Boolean(key);
      })
    : [];
  if (entries.length === 0) return { appended: [], overwritten: [], skipped: [] };
  const overwriteKeys = params.overwriteKeys || new Set<string>();

  let existing = "";
  if (await fs.pathExists(filePath)) {
    existing = await fs.readFile(filePath, "utf-8");
  }
  const existingKeys = parseEnvKeys(existing);
  const appendedEntries: EnvEntry[] = [];
  const skippedEntries: EnvEntry[] = [];
  const overwrittenEntries: EnvEntry[] = [];
  let nextContent = existing;

  for (const entry of entries) {
    if (!existingKeys.has(entry.key)) {
      appendedEntries.push(entry);
      continue;
    }
    if (!overwriteKeys.has(entry.key)) {
      skippedEntries.push(entry);
      continue;
    }
    const linePattern = new RegExp(
      `^${escapeRegExp(entry.key)}\\s*=.*$`,
      "gm",
    );
    if (linePattern.test(nextContent)) {
      nextContent = nextContent.replace(linePattern, `${entry.key}=${entry.value}`);
    } else {
      appendedEntries.push(entry);
      continue;
    }
    overwrittenEntries.push(entry);
  }

  if (appendedEntries.length > 0) {
    const lines: string[] = [];
    if (!nextContent.trim()) {
      lines.push("# ShipMyAgent 环境变量");
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

  if (
    appendedEntries.length > 0 ||
    overwrittenEntries.length > 0 ||
    !(await fs.pathExists(filePath))
  ) {
    await fs.writeFile(filePath, nextContent, "utf-8");
  }

  return {
    appended: appendedEntries.map((item) => item.key),
    overwritten: overwrittenEntries.map((item) => item.key),
    skipped: skippedEntries.map((item) => item.key),
  };
}

/**
 * 获取用户级 `.agents/skills` 目录。
 */
function getUserAgentsSkillsDir(): string {
  return path.join(os.homedir(), ".agents", "skills");
}

/**
 * 推断发布包内置 skills 目录。
 */
function getBuiltInSkillsDirFromBin(): string {
  // 关键点（中文）
  // - 发布包中该文件在 `bin/main/server/commands/Init.js`
  // - 内置 skills 会在 build 阶段复制到 `bin/services/skills/built-in`
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const binRoot = path.resolve(__dirname, "..");
  return path.join(binRoot, "services", "skills", "built-in");
}

/**
 * 安装内置 skills 到用户目录。
 *
 * 关键点（中文）
 * - 采用覆盖复制策略，保证升级后用户目录可获得最新内置能力。
 */
async function installBuiltInSkillsToUserDir(): Promise<void> {
  const src = getBuiltInSkillsDirFromBin();
  const dst = getUserAgentsSkillsDir();

  try {
    if (!(await fs.pathExists(src))) return;
    const stat = await fs.stat(src);
    if (!stat.isDirectory()) return;
  } catch {
    return;
  }

  try {
    await fs.ensureDir(dst);
    // 关键点（中文）：覆盖复制，保证升级后内置 skills 可更新到用户目录。
    await fs.copy(src, dst, { overwrite: true, dereference: true });
    console.log(`✅ Installed built-in skills to ${dst}`);
  } catch (err) {
    console.log(`⚠️  Failed to install built-in skills to ${dst}`);
    console.log(`   Error: ${String(err)}`);
  }
}

/**
 * 同步 `~/.claude/skills` 到 `~/.agents/skills`。
 *
 * 关键点（中文）
 * - 这是兼容开发者本地习惯的“软同步”，失败不阻断 init。
 */
async function syncClaudeSkillsToUserAgentsSkills(): Promise<void> {
  const src = path.join(os.homedir(), ".claude", "skills");
  const dst = getUserAgentsSkillsDir();
  try {
    if (!(await fs.pathExists(src))) return;
    const stat = await fs.stat(src);
    if (!stat.isDirectory()) return;
    await fs.ensureDir(dst);
    await fs.copy(src, dst, { overwrite: true, dereference: true });
  } catch {
    // ignore
  }
}

/**
 * init 命令入口。
 *
 * 流程（中文）
 * 1) 校验项目目录与覆盖策略
 * 2) 交互收集配置
 * 3) 生成配置与目录
 * 4) 可选安装推荐 skills
 */
export async function initCommand(
  cwd: string = ".",
  options: { force?: boolean } = {},
): Promise<void> {
  const projectRoot = path.resolve(cwd);
  let allowOverwrite = Boolean(options.force);
  const dotEnvPath = path.join(projectRoot, ".env");
  const dotEnvExamplePath = path.join(projectRoot, ".env.example");
  const existingDotEnvContent = (await fs.pathExists(dotEnvPath))
    ? await fs.readFile(dotEnvPath, "utf-8")
    : "";
  const existingDotEnvValues = parseEnvValueMap(existingDotEnvContent);
  const TELEGRAM_BOT_TOKEN = "${TELEGRAM_BOT_TOKEN}";
  const FEISHU_APP_ID = "${FEISHU_APP_ID}";
  const FEISHU_APP_SECRET = "${FEISHU_APP_SECRET}";
  const QQ_APP_ID = "${QQ_APP_ID}";
  const QQ_APP_SECRET = "${QQ_APP_SECRET}";

  console.log(`🚀 Initializing ShipMyAgent project: ${projectRoot}`);

  // Check if core initialization files already exist
  const existingProfileMd = fs.existsSync(getProfileMdPath(projectRoot));
  const existingSoulMd = fs.existsSync(getSoulMdPath(projectRoot));
  const existingUserMd = fs.existsSync(getUserMdPath(projectRoot));
  const existingShipJson = fs.existsSync(getShipJsonPath(projectRoot));

  // 关键点（中文）：已存在的 PROFILE.md 永远不覆盖，只在 ship.json 已存在时询问覆盖。
  if (existingShipJson) {
    if (!allowOverwrite) {
      const confirmResponse = (await prompts({
        type: "confirm",
        name: "overwrite",
        message:
          "ship.json already exists. Overwrite existing ship.json and continue?",
        initial: false,
      })) as { overwrite?: boolean };

      if (!confirmResponse.overwrite) {
        console.log("❌ Initialization cancelled");
        return;
      }
      allowOverwrite = true;
    }
  }

  // Collect configuration information
  // 交互采集（中文）：provider type + apiKey + modelName + channels + 推荐 skills。
  const response = (await prompts([
    {
      type: "text",
      name: "name",
      message: "Agent name",
      initial: path.basename(projectRoot),
    },
    {
      type: "select",
      name: "providerType",
      message: "Select LLM provider type",
      choices: INIT_PROVIDER_CHOICES,
      initial: 0,
    },
    {
      type: "text",
      name: "apiKey",
      message: "Input API key",
      initial: String(
        existingDotEnvValues[LLM_API_KEY_ENV_KEY] ||
          process.env[LLM_API_KEY_ENV_KEY] ||
          "",
      ).trim(),
      validate: (value) =>
        String(value || "").trim() ? true : "API key is required",
    },
    {
      type: "text",
      name: "modelName",
      message: "Input model name",
      initial: (prev, values) => {
        const existingModelName = String(
          existingDotEnvValues[LLM_MODEL_ENV_KEY] || "",
        ).trim();
        if (existingModelName) return existingModelName;
        const providerType = resolveInitProviderType(values.providerType);
        return INIT_DEFAULT_MODEL_BY_PROVIDER[providerType];
      },
      validate: (value) =>
        String(value || "").trim() ? true : "Model name is required",
    },
    {
      type: "text",
      name: "baseUrl",
      message: "Input base URL (optional, press Enter to skip)",
      initial: String(existingDotEnvValues[LLM_BASE_URL_ENV_KEY] || "").trim(),
    },
    {
      // 关键交互: Chat channels 允许多选，未选择的就不写入 ship.json
      type: "multiselect",
      name: "channels",
      message: "Select chat channels (multi-select)",
      choices: [
        { title: "Telegram", value: "telegram" },
        { title: "Feishu", value: "feishu" },
        { title: "QQ", value: "qq" },
      ],
    },
    {
      type: (prev, values) =>
        Array.isArray(values.channels) && values.channels.includes("qq")
          ? "confirm"
          : null,
      name: "qqSandbox",
      message: "Use QQ sandbox environment?",
      initial: false,
    },
    {
      type: "multiselect",
      name: "skillsToInstall",
      message: "Install recommended skills (optional)",
      choices: [
        {
          title: "Vercel React/Next.js Best Practices",
          value: "vercel-labs/agent-skills@vercel-react-best-practices",
        },
        {
          title: "Web Design Guidelines",
          value: "vercel-labs/agent-skills@web-design-guidelines",
        },
        {
          title: "Agent Browser (browser automation)",
          value: "vercel-labs/agent-skills@agent-browser",
        },
      ],
    },
  ])) as InitPromptResponse;

  // 关键点（中文）：agent_name 同时用于 `ship.json.name` 与 init 模板变量渲染，避免两处来源不一致。
  const agentName =
    String(response.name || "").trim() || path.basename(projectRoot);
  const providerType = resolveInitProviderType(response.providerType);
  const modelName =
    String(response.modelName || "").trim() ||
    INIT_DEFAULT_MODEL_BY_PROVIDER[providerType];
  let apiKey = String(response.apiKey || "").trim();
  let resolvedModelName = modelName;
  let resolvedBaseUrl = String(response.baseUrl || "").trim();
  const overwriteEnvKeys = new Set<string>();
  const hasExistingApiKey = Object.prototype.hasOwnProperty.call(
    existingDotEnvValues,
    LLM_API_KEY_ENV_KEY,
  );
  const hasExistingModelName = Object.prototype.hasOwnProperty.call(
    existingDotEnvValues,
    LLM_MODEL_ENV_KEY,
  );
  const hasExistingBaseUrl = Object.prototype.hasOwnProperty.call(
    existingDotEnvValues,
    LLM_BASE_URL_ENV_KEY,
  );
  const existingApiKey = String(
    existingDotEnvValues[LLM_API_KEY_ENV_KEY] || "",
  ).trim();
  const existingModelName = String(
    existingDotEnvValues[LLM_MODEL_ENV_KEY] || "",
  ).trim();
  const existingBaseUrl = String(
    existingDotEnvValues[LLM_BASE_URL_ENV_KEY] || "",
  ).trim();

  if (hasExistingApiKey && apiKey !== existingApiKey) {
    const confirmOverwriteApiKey = (await prompts({
      type: "confirm",
      name: "overwrite",
      message: `${LLM_API_KEY_ENV_KEY} already exists in .env. Overwrite it?`,
      initial: false,
    })) as { overwrite?: boolean };
    if (confirmOverwriteApiKey.overwrite) {
      overwriteEnvKeys.add(LLM_API_KEY_ENV_KEY);
    } else {
      apiKey = existingApiKey;
    }
  }

  if (hasExistingModelName && resolvedModelName !== existingModelName) {
    const confirmOverwriteModel = (await prompts({
      type: "confirm",
      name: "overwrite",
      message: `${LLM_MODEL_ENV_KEY} already exists in .env. Overwrite it?`,
      initial: false,
    })) as { overwrite?: boolean };
    if (confirmOverwriteModel.overwrite) {
      overwriteEnvKeys.add(LLM_MODEL_ENV_KEY);
    } else {
      resolvedModelName = existingModelName;
    }
  }

  // 关键点（中文）
  // - baseUrl 允许留空（skip）。
  // - 若已有值且用户输入了新值，则二次确认是否覆盖。
  if (!resolvedBaseUrl) {
    resolvedBaseUrl = existingBaseUrl;
  } else if (hasExistingBaseUrl && resolvedBaseUrl !== existingBaseUrl) {
    const confirmOverwriteBaseUrl = (await prompts({
      type: "confirm",
      name: "overwrite",
      message: `${LLM_BASE_URL_ENV_KEY} already exists in .env. Overwrite it?`,
      initial: false,
    })) as { overwrite?: boolean };
    if (confirmOverwriteBaseUrl.overwrite) {
      overwriteEnvKeys.add(LLM_BASE_URL_ENV_KEY);
    } else {
      resolvedBaseUrl = existingBaseUrl;
    }
  }
  const initTemplateVariables = {
    agent_name: agentName,
  };

  // Create configuration files
  const profileMdPath = getProfileMdPath(projectRoot);
  const soulMdPath = getSoulMdPath(projectRoot);
  const userMdPath = getUserMdPath(projectRoot);
  const shipJsonPath = getShipJsonPath(projectRoot);
  const staticPromptFiles = [
    {
      filename: "PROFILE.md",
      exists: existingProfileMd,
      filePath: profileMdPath,
      content: renderTemplateVariables(
        DEFAULT_PROFILE_MD_TEMPLATE,
        initTemplateVariables,
      ),
    },
    {
      filename: "SOUL.md",
      exists: existingSoulMd,
      filePath: soulMdPath,
      content: renderTemplateVariables(
        DEFAULT_SOUL_MD_TEMPLATE,
        initTemplateVariables,
      ),
    },
    {
      filename: "USER.md",
      exists: existingUserMd,
      filePath: userMdPath,
      content: renderTemplateVariables(
        DEFAULT_USER_MD_TEMPLATE,
        initTemplateVariables,
      ),
    },
  ] as const;

  // 关键点（中文）：静态 prompt 文件统一走同一套写入逻辑，仅通过文件名与模板区分。
  for (const file of staticPromptFiles) {
    if (file.exists) {
      console.log(`⏭️  Skipped existing ${file.filename}`);
      continue;
    }
    await fs.writeFile(file.filePath, file.content);
    console.log(`✅ Created ${file.filename}`);
  }

  // Save ship.json
  // Build LLM configuration
  const activeModelId = "default";
  const providerId = "default";

  // 关键点（中文）：init 默认生成“1 provider + 1 model”的多模型结构，后续用户可按需扩展。
  const llmConfig: ShipConfig["llm"] = {
    activeModel: activeModelId,
    providers: {
      [providerId]: {
        type: providerType,
        baseUrl: `\${${LLM_BASE_URL_ENV_KEY}}`,
        apiKey: `\${${LLM_API_KEY_ENV_KEY}}`,
      },
    },
    models: {
      [activeModelId]: {
        provider: providerId,
        name: `\${${LLM_MODEL_ENV_KEY}}`,
        temperature: 0.7,
      },
    },
  };

  const selectedChannels = new Set<string>(
    Array.isArray(response.channels) ? (response.channels as string[]) : [],
  );

  const channelsConfig: NonNullable<
    NonNullable<NonNullable<ShipConfig["services"]>["chat"]>["channels"]
  > = {};
  if (selectedChannels.has("telegram")) {
    channelsConfig.telegram = {
      enabled: true,
      botToken: TELEGRAM_BOT_TOKEN,
      // 关键点（中文）：每个 channel 独立配置单值 auth_id，默认留空。
      auth_id: "",
    };
  }
  if (selectedChannels.has("feishu")) {
    channelsConfig.feishu = {
      enabled: true,
      appId: FEISHU_APP_ID,
      appSecret: FEISHU_APP_SECRET,
      domain: "https://open.feishu.cn",
      auth_id: "",
    };
  }
  if (selectedChannels.has("qq")) {
    channelsConfig.qq = {
      enabled: true,
      appId: QQ_APP_ID,
      appSecret: QQ_APP_SECRET,
      sandbox: Boolean(response.qqSandbox),
      auth_id: "",
    };
  }

  const shipConfig: ShipConfig = {
    $schema: DEFAULT_SHIP_JSON.$schema,
    name: agentName,
    version: "1.0.0",
    start: {
      port: 3000,
      host: "0.0.0.0",
      webui: false,
      webport: 3001,
    },
    llm: llmConfig,
    // 关键点（中文）：所有服务相关配置统一放入 `services`。
    services: {
      // skills 扫描目录统一使用 `.agents/skills`（project/home 默认 roots）
      skills: { paths: [".agents/skills"] },
      ...(Object.keys(channelsConfig).length > 0
        ? {
            chat: {
              method: "direct",
              channels: channelsConfig,
            },
          }
        : {}),
    },
  };

  await saveJson(shipJsonPath, shipConfig);
  console.log(`✅ Created ship.json`);

  // Create .env and .env.example
  // 关键点（中文）
  // - `.env` 写入真实值（仅追加缺失键，不覆盖已有键）
  // - `.env.example` 写入示例值（便于团队同步所需变量）
  const envRealEntries: EnvEntry[] = [
    { key: LLM_API_KEY_ENV_KEY, value: apiKey },
    { key: LLM_MODEL_ENV_KEY, value: resolvedModelName },
    { key: LLM_BASE_URL_ENV_KEY, value: resolvedBaseUrl },
  ];
  const envExampleEntries: EnvEntry[] = [
    { key: LLM_API_KEY_ENV_KEY, value: "" },
    { key: LLM_MODEL_ENV_KEY, value: resolvedModelName },
    { key: LLM_BASE_URL_ENV_KEY, value: "" },
  ];
  if (selectedChannels.has("telegram")) {
    envRealEntries.push(
      { key: "TELEGRAM_BOT_TOKEN", value: "" },
      { key: "TELEGRAM_AUTH_ID", value: "" },
    );
    envExampleEntries.push(
      { key: "TELEGRAM_BOT_TOKEN", value: "" },
      { key: "TELEGRAM_AUTH_ID", value: "" },
    );
  }
  if (selectedChannels.has("feishu")) {
    envRealEntries.push(
      { key: "FEISHU_APP_ID", value: "" },
      { key: "FEISHU_APP_SECRET", value: "" },
      { key: "FEISHU_AUTH_ID", value: "" },
    );
    envExampleEntries.push(
      { key: "FEISHU_APP_ID", value: "" },
      { key: "FEISHU_APP_SECRET", value: "" },
      { key: "FEISHU_AUTH_ID", value: "" },
    );
  }
  if (selectedChannels.has("qq")) {
    const qqSandbox = Boolean(response.qqSandbox) ? "true" : "false";
    envRealEntries.push(
      { key: "QQ_APP_ID", value: "" },
      { key: "QQ_APP_SECRET", value: "" },
      { key: "QQ_SANDBOX", value: qqSandbox },
      { key: "QQ_AUTH_ID", value: "" },
    );
    envExampleEntries.push(
      { key: "QQ_APP_ID", value: "" },
      { key: "QQ_APP_SECRET", value: "" },
      { key: "QQ_SANDBOX", value: qqSandbox },
      { key: "QQ_AUTH_ID", value: "" },
    );
  }

  const envResult = await appendMissingEnvEntries({
    filePath: dotEnvPath,
    sectionTitle: "ShipMyAgent Create",
    entries: envRealEntries,
    overwriteKeys: overwriteEnvKeys,
  });
  const envExampleResult = await appendMissingEnvEntries({
    filePath: dotEnvExamplePath,
    sectionTitle: "ShipMyAgent Create Example",
    entries: envExampleEntries,
  });
  if (envResult.appended.length > 0 || envResult.overwritten.length > 0) {
    const detail = [
      envResult.appended.length > 0
        ? `added: ${envResult.appended.join(", ")}`
        : "",
      envResult.overwritten.length > 0
        ? `overwritten: ${envResult.overwritten.join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("; ");
    console.log(`✅ Updated .env (${detail})`);
  } else {
    console.log("⏭️  Skipped .env (required keys already exist)");
  }
  if (envExampleResult.appended.length > 0) {
    console.log(
      `✅ Updated .env.example (added: ${envExampleResult.appended.join(", ")})`,
    );
  } else {
    console.log("⏭️  Skipped .env.example (required keys already exist)");
  }

  // Create .ship directory structure
  const dirs = [
    getShipDirPath(projectRoot),
    getShipTasksDirPath(projectRoot),
    getLogsDirPath(projectRoot),
    getCacheDirPath(projectRoot),
    getShipProfileDirPath(projectRoot),
    getShipDataDirPath(projectRoot),
    getShipContextRootDirPath(projectRoot),
    getShipPublicDirPath(projectRoot),
    getShipConfigDirPath(projectRoot),
    path.join(projectRoot, ".agents", "skills"),
    path.join(getShipDirPath(projectRoot), "schema"),
    getShipDebugDirPath(projectRoot),
  ];

  for (const dir of dirs) {
    await ensureDir(dir);
  }
  console.log(`✅ Created .ship/ directory structure`);

  // Write JSON schema for ship.json (for editor validation via "$schema")
  const shipSchemaPath = getShipSchemaPath(projectRoot);
  await ensureDir(path.dirname(shipSchemaPath));
  await saveJson(shipSchemaPath, SHIP_JSON_SCHEMA);
  console.log(`✅ Created ship.schema.json`);

  // Create profile memory files (optional, but recommended)
  try {
    await ensureDir(getShipProfileDirPath(projectRoot));
    await fs.ensureFile(getShipProfilePrimaryPath(projectRoot));
    await fs.ensureFile(getShipProfileOtherPath(projectRoot));
  } catch {
    // ignore
  }

  // Install built-in skills to user directory (~/.agents/skills)
  await installBuiltInSkillsToUserDir();

  // Skills installation (optional)
  const skillsToInstall: string[] = Array.isArray(response.skillsToInstall)
    ? response.skillsToInstall.map((x) => String(x)).filter(Boolean)
    : [];

  if (skillsToInstall.length > 0) {
    console.log(
      "\n🧩 Installing skills via `npx skills` (global, claude-code) ...",
    );
    for (const spec of skillsToInstall) {
      try {
        // 关键点（中文）
        // - `-y`（npx）：跳过安装确认
        // - `-g`：`npx skills` 默认全局安装到 ~/.claude/skills（随后同步到 ~/.agents/skills）
        // - `--agent claude-code`：对齐 Claude Code-compatible 目录结构（SKILL.md）
        await execa(
          "npx",
          ["-y", "skills", "add", spec, "--agent", "claude-code", "-g", "-y"],
          { stdio: "inherit" },
        );
      } catch (err) {
        console.log(`⚠️  Failed to install skill: ${spec}`);
        console.log(`   Error: ${String(err)}`);
      }
    }
    // 同步到 `~/.agents/skills`，保证 ShipMyAgent 可发现
    await syncClaudeSkillsToUserAgentsSkills();
  }

  console.log("\n🎉 Initialization complete!\n");
  console.log(`📦 Current model: ${providerType} / ${resolvedModelName}`);
  console.log(`🌐 API URL: ${resolvedBaseUrl || "-"}\n`);

  if (selectedChannels.has("feishu")) {
    console.log("📱 Feishu chat channel enabled");
    console.log(
      "   Please configure FEISHU_APP_ID and FEISHU_APP_SECRET in ship.json (services.chat.channels.feishu)",
    );
    console.log(
      "   Optional auth: services.chat.channels.feishu.auth_id or FEISHU_AUTH_ID\n",
    );
  }
  if (selectedChannels.has("telegram")) {
    console.log("📱 Telegram chat channel enabled");
    console.log(
      "   Please configure TELEGRAM_BOT_TOKEN in ship.json (services.chat.channels.telegram)",
    );
    console.log(
      "   Optional auth: services.chat.channels.telegram.auth_id or TELEGRAM_AUTH_ID\n",
    );
  }
  if (selectedChannels.has("qq")) {
    console.log("📱 QQ chat channel enabled");
    console.log(
      "   Please configure QQ_APP_ID and QQ_APP_SECRET in ship.json (services.chat.channels.qq)",
    );
    console.log(
      "   Optional auth: services.chat.channels.qq.auth_id or QQ_AUTH_ID\n",
    );
    console.log(
      "   Optional: set QQ_SANDBOX=true to use sandbox environment\n",
    );
  }

  const nextSteps: string[] = [
    "Edit PROFILE.md to customize agent behavior",
    "Edit SOUL.md to customize your core operating principles",
    "Edit USER.md to define user goals and communication preferences",
    "Edit ship.json to modify llm.activeModel / llm.models / llm.providers",
  ];

  if (selectedChannels.has("telegram")) {
    nextSteps.push(
      "Configure services.chat.channels.telegram (Bot Token)",
    );
    nextSteps.push(
      "Optional: configure services.chat.channels.telegram.auth_id (or TELEGRAM_AUTH_ID)",
    );
  }
  if (selectedChannels.has("feishu")) {
    nextSteps.push(
      "Configure services.chat.channels.feishu (App ID and App Secret)",
    );
    nextSteps.push(
      "Optional: configure services.chat.channels.feishu.auth_id (or FEISHU_AUTH_ID)",
    );
  }
  if (selectedChannels.has("qq")) {
    nextSteps.push(
      "Configure services.chat.channels.qq (App ID and App Secret)",
    );
    nextSteps.push(
      "Optional: configure services.chat.channels.qq.auth_id (or QQ_AUTH_ID)",
    );
  }
  nextSteps.push('Run "sma agent on" to start the agent');

  console.log("Next steps:");
  for (const [idx, line] of nextSteps.entries()) {
    console.log(`  ${idx + 1}. ${line}`);
  }
  console.log("");
  console.log(
    "💡 Tip: 本次输入的 API Key 与 Model 已按“缺失才追加”策略写入 .env。\n",
  );
  console.log(
    "To switch models or modify configuration, edit the llm field in ship.json directly.\n",
  );
}
