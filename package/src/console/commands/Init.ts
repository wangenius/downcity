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
} from "@/console/env/Paths.js";
import { ensureDir, saveJson } from "@/utils/storage/index.js";
import type { ShipConfig } from "@/console/env/Config.js";
import { SHIP_JSON_SCHEMA } from "@/console/constants/ShipSchema.js";
import { DEFAULT_SHIP_JSON } from "@/console/constants/Ship.js";
import { ConsoleStore } from "@utils/store/index.js";
import {
  DEFAULT_PROFILE_MD_TEMPLATE,
  DEFAULT_SOUL_MD_TEMPLATE,
  DEFAULT_USER_MD_TEMPLATE,
} from "@agent/prompts/common/InitPrompts.js";
import { renderTemplateVariables } from "@/utils/Template.js";

type InitPromptResponse = {
  name?: string;
  primaryModelId?: string;
  channels?: string[];
  qqSandbox?: boolean;
};

type EnvEntry = {
  key: string;
  value: string;
};


/**
 * 读取 console 全局模型 ID 列表。
 */
function listConsoleModelIds(): string[] {
  const store = new ConsoleStore();
  try {
    return store
      .listModels()
      .map((item) => String(item.id || "").trim())
      .filter((id) => id.length > 0);
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
 * init 命令入口。
 *
 * 流程（中文）
 * 1) 校验项目目录与覆盖策略
 * 2) 交互收集配置
 * 3) 生成配置与目录
 * 4) 生成最小可运行结构（skills 目录仅创建，不做自动同步/安装）
 */
export async function initCommand(
  cwd: string = ".",
  options: { force?: boolean } = {},
): Promise<void> {
  const projectRoot = path.resolve(cwd);
  let allowOverwrite = Boolean(options.force);
  const dotEnvPath = path.join(projectRoot, ".env");
  const dotEnvExamplePath = path.join(projectRoot, ".env.example");
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
  const consoleModelIds = listConsoleModelIds();
  // 关键点（中文）：模型池为空时，继续 create 只会生成“必然启动失败”的配置，这里直接中止并给出明确修复路径。
  if (consoleModelIds.length === 0) {
    console.error("❌ Console model pool is empty.");
    console.error("   Please configure at least one model before `sma agent create`:");
    console.error("   1) sma console model create");
    console.error("   2) or use sma console model update/test for scripting");
    process.exit(1);
  }

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
  // 交互采集（中文）：agent name + channels。
  const response = (await prompts([
    {
      type: "text",
      name: "name",
      message: "Agent name",
      initial: path.basename(projectRoot),
    },
    {
      type: "select",
      name: "primaryModelId",
      message: "Select primary model (from console model pool)",
      choices: consoleModelIds.map((id) => ({ title: id, value: id })),
      initial: 0,
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
  ])) as InitPromptResponse;

  // 关键点（中文）：agent_name 同时用于 `ship.json.name` 与 init 模板变量渲染，避免两处来源不一致。
  const agentName =
    String(response.name || "").trim() || path.basename(projectRoot);
  const primaryModelId = String(response.primaryModelId || "").trim() || "default";
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
    model: {
      primary: primaryModelId,
    },
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
  const envRealEntries: EnvEntry[] = [];
  const envExampleEntries: EnvEntry[] = [];
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

  console.log("\n🎉 Initialization complete!\n");
  console.log(`📦 Agent model.primary: ${primaryModelId}`);
  console.log("🌐 Model pool source: ~/.ship/ship.json (console global)\n");

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
    "Edit ship.json to modify model.primary (bind to console model id)",
    'Use "sma console model ..." to manage global model pool',
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
    "💡 Tip: 模型管理在 console 全局层完成，agent 仅绑定 model.primary。\n",
  );
}
