/**
 * `sma init`：初始化 console（全局中台）的默认配置（`~/.ship/`）。
 *
 * 生成内容
 * - `~/.ship/ship.json`：全局默认配置（模型、插件/skills 等）
 * - `~/.ship/.env`：全局默认环境变量（例如 API Key / 默认模型）
 * - `~/.ship/schema/ship.schema.json`：给编辑器的 schema（可选）
 *
 * 关键点（中文）
 * - console 是强依赖：`sma console start` + `sma agent start` 都会使用这里的默认配置。
 * - agent 项目内的 `ship.json/.env` 允许覆盖 console 的默认值（同名 env 优先、同字段 JSON 以 agent 为准）。
 */

import path from "node:path";
import fs from "fs-extra";
import prompts from "prompts";
import type { LlmProviderType } from "@agent/types/LlmConfig.js";
import type { ShipConfig } from "@/console/env/Config.js";
import { SHIP_JSON_SCHEMA } from "@/console/constants/ShipSchema.js";
import { saveJson } from "@/utils/storage/index.js";
import {
  getConsoleDotenvPath,
  getConsoleRootDirPath,
  getConsoleShipJsonPath,
} from "@/console/runtime/ConsolePaths.js";
import { ConsoleStore } from "@utils/store/index.js";

type InitProviderChoice = { title: string; value: LlmProviderType };

type EnvEntry = {
  key: string;
  value: string;
};

const LLM_PROVIDER_TYPE_ENV_KEY = "LLM_PROVIDER_TYPE";
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

const INIT_DEFAULT_BASE_URL_BY_PROVIDER: Partial<Record<LlmProviderType, string>> = {
  anthropic: "https://api.anthropic.com/v1",
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
};

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

/**
 * Upsert env entries：存在则覆盖，不存在则追加。
 */
async function upsertEnvEntries(params: {
  filePath: string;
  sectionTitle: string;
  entries: EnvEntry[];
  overwrite?: boolean;
}): Promise<{ appended: string[]; overwritten: string[]; skipped: string[] }> {
  const filePath = String(params.filePath || "").trim();
  const entries = Array.isArray(params.entries)
    ? params.entries.filter((item) => Boolean(String(item?.key || "").trim()))
    : [];
  if (!filePath || entries.length === 0) {
    return { appended: [], overwritten: [], skipped: [] };
  }

  let existing = "";
  if (await fs.pathExists(filePath)) {
    existing = await fs.readFile(filePath, "utf-8");
  }
  const existingKeys = parseEnvKeys(existing);
  const overwrite = params.overwrite === true;

  const appended: EnvEntry[] = [];
  const overwritten: EnvEntry[] = [];
  const skipped: EnvEntry[] = [];
  let next = existing;

  for (const entry of entries) {
    if (!existingKeys.has(entry.key)) {
      appended.push(entry);
      continue;
    }
    if (!overwrite) {
      skipped.push(entry);
      continue;
    }
    const pattern = new RegExp(`^${entry.key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*=.*$`, "gm");
    if (pattern.test(next)) {
      next = next.replace(pattern, `${entry.key}=${entry.value}`);
      overwritten.push(entry);
      continue;
    }
    // fallback：理论上不会发生（已有 key 但未命中行），按追加处理
    appended.push(entry);
  }

  if (appended.length > 0) {
    const lines: string[] = [];
    if (!next.trim()) lines.push("# ShipMyAgent 环境变量");
    lines.push("", `# ${params.sectionTitle}`);
    for (const entry of appended) lines.push(`${entry.key}=${entry.value}`);
    let chunk = lines.join("\n");
    if (next && !next.endsWith("\n")) chunk = `\n${chunk}`;
    next = `${next}${chunk}\n`;
  }

  if (next !== existing || !(await fs.pathExists(filePath))) {
    await fs.writeFile(filePath, next, "utf-8");
  }

  return {
    appended: appended.map((x) => x.key),
    overwritten: overwritten.map((x) => x.key),
    skipped: skipped.map((x) => x.key),
  };
}

/**
 * console 初始化入口。
 */
export async function consoleInitCommand(options?: { force?: boolean }): Promise<void> {
  const operationRoot = getConsoleRootDirPath();
  const shipJsonPath = getConsoleShipJsonPath();
  const dotenvPath = getConsoleDotenvPath();
  const schemaDir = path.join(operationRoot, "schema");
  const schemaPath = path.join(schemaDir, "ship.schema.json");

  await fs.ensureDir(operationRoot);

  const existingShipJson = await fs.pathExists(shipJsonPath);
  let allowOverwrite = options?.force === true;
  if (existingShipJson && !allowOverwrite) {
    const confirm = (await prompts({
      type: "confirm",
      name: "overwrite",
      message: `~/.ship/ship.json already exists. Overwrite it?`,
      initial: false,
    })) as { overwrite?: boolean };
    if (!confirm.overwrite) {
      console.log("❌ Initialization cancelled");
      return;
    }
    allowOverwrite = true;
  }

  const response = (await prompts([
    {
      type: "select",
      name: "providerType",
      message: "请选择 LLM Provider",
      choices: INIT_PROVIDER_CHOICES,
      initial: 0,
    },
    {
      type: "password",
      name: "apiKey",
      message: "请输入 API Key（将写入 ~/.ship/.env）",
    },
    {
      type: "text",
      name: "modelName",
      message: "默认模型名（将写入 ~/.ship/.env）",
      initial: (_prev: unknown, values: { providerType?: LlmProviderType }) => {
        const t = (values?.providerType || "openai") as LlmProviderType;
        return INIT_DEFAULT_MODEL_BY_PROVIDER[t] || "gpt-4o-mini";
      },
    },
    {
      type: "text",
      name: "baseUrl",
      message: "Base URL（可留空）",
      initial: (_prev: unknown, values: { providerType?: LlmProviderType }) => {
        const t = (values?.providerType || "openai") as LlmProviderType;
        return INIT_DEFAULT_BASE_URL_BY_PROVIDER[t] || "";
      },
    },
  ])) as {
    providerType?: LlmProviderType;
    apiKey?: string;
    modelName?: string;
    baseUrl?: string;
  };

  const providerType = (response.providerType || "openai") as LlmProviderType;
  const apiKey = String(response.apiKey || "").trim();
  const modelName = String(response.modelName || "").trim();
  const baseUrl = String(response.baseUrl || "").trim();

  if (!apiKey) {
    console.log("❌ API Key is required");
    return;
  }
  if (!modelName) {
    console.log("❌ model name is required");
    return;
  }

  // 写入 schema（给编辑器使用）
  await fs.ensureDir(schemaDir);
  await saveJson(schemaPath, SHIP_JSON_SCHEMA);

  const shipConfig: ShipConfig = {
    $schema: "./schema/ship.schema.json",
    name: "console",
    version: "1.0.0",
    services: {
      skills: { paths: [".agents/skills"] },
    },
  };

  await saveJson(shipJsonPath, shipConfig);
  console.log(`✅ Created ~/.ship/ship.json`);

  const envEntries: EnvEntry[] = [
    { key: LLM_PROVIDER_TYPE_ENV_KEY, value: providerType },
    { key: LLM_API_KEY_ENV_KEY, value: apiKey },
    { key: LLM_MODEL_ENV_KEY, value: modelName },
    { key: LLM_BASE_URL_ENV_KEY, value: baseUrl },
  ];
  const envResult = await upsertEnvEntries({
    filePath: dotenvPath,
    sectionTitle: "ShipMyAgent Console",
    entries: envEntries,
    overwrite: allowOverwrite,
  });
  if (envResult.appended.length > 0 || envResult.overwritten.length > 0) {
    const detail = [
      envResult.appended.length > 0 ? `added: ${envResult.appended.join(", ")}` : "",
      envResult.overwritten.length > 0 ? `overwritten: ${envResult.overwritten.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    console.log(`✅ Updated ~/.ship/.env (${detail})`);
  } else if (envResult.skipped.length > 0) {
    console.log("⏭️  Skipped ~/.ship/.env (keys already exist; re-run with --force to overwrite)");
  }

  const modelStore = new ConsoleStore();
  if (allowOverwrite) {
    modelStore.clearAll();
  }
  await modelStore.upsertProvider({
    id: "default",
    type: providerType,
    baseUrl: `\${${LLM_BASE_URL_ENV_KEY}}`,
    apiKey: `\${${LLM_API_KEY_ENV_KEY}}`,
  });
  modelStore.upsertModel({
    id: "default",
    providerId: "default",
    name: `\${${LLM_MODEL_ENV_KEY}}`,
    temperature: 0.7,
  });
  modelStore.close();
  console.log("✅ Initialized ~/.ship/ship.db model store");

  // 关键点（中文）：skills 仅使用 `~/.agents/skills`，不做 built-in/claude 自动同步。
}
