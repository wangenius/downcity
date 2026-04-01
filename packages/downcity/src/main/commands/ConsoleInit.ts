/**
 * `city init`：初始化 console（全局中台）的默认配置（`~/.downcity/`）。
 *
 * 生成内容
 * - `~/.downcity/downcity.db`：console 全局配置与模型池（敏感字段加密）
 * - `~/.downcity/schema/downcity.schema.json`：给项目 downcity.json 的 schema（可选）
 *
 * 关键点（中文）
 * - console 是强依赖：`city console start` + `city agent start` 都会使用这里的默认配置。
 * - console 级不再使用 `~/.downcity/downcity.json` 和 `~/.downcity/.env`。
 * - agent 项目内 `downcity.json/.env` 仍保持项目级配置职责。
 */

import path from "node:path";
import fs from "fs-extra";
import prompts from "prompts";
import type { LlmProviderType } from "@/types/LlmConfig.js";
import { DOWNCITY_JSON_SCHEMA } from "@/main/constants/DowncitySchema.js";
import { saveJson } from "@/utils/storage/index.js";
import {
  getConsoleRootDirPath,
} from "@/main/runtime/ConsolePaths.js";
import { ConsoleStore } from "@utils/store/index.js";

type InitProviderChoice = { title: string; value: LlmProviderType };

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
  moonshot: "kimi-k2.5",
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

/**
 * console 初始化入口。
 */
export async function consoleInitCommand(options?: { force?: boolean }): Promise<void> {
  const operationRoot = getConsoleRootDirPath();
  const schemaDir = path.join(operationRoot, "schema");
  const schemaPath = path.join(schemaDir, "downcity.schema.json");

  await fs.ensureDir(operationRoot);
  const allowOverwrite = options?.force === true;

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
      message: "请输入 API Key（将加密写入 ~/.downcity/downcity.db）",
    },
    {
      type: "text",
      name: "modelName",
      message: "默认模型名（将写入 ~/.downcity/downcity.db）",
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
  await saveJson(schemaPath, DOWNCITY_JSON_SCHEMA);

  const modelStore = new ConsoleStore();
  try {
    if (allowOverwrite) {
      modelStore.clearAll();
    }
    await modelStore.upsertProvider({
      id: "default",
      type: providerType,
      ...(baseUrl ? { baseUrl } : {}),
      apiKey,
    });
    modelStore.upsertModel({
      id: "default",
      providerId: "default",
      name: modelName,
      temperature: 0.7,
    });
  } finally {
    modelStore.close();
  }
  console.log("✅ Saved console global settings into ~/.downcity/downcity.db (encrypted)");
  console.log("✅ Initialized ~/.downcity/downcity.db model store");

  // 关键点（中文）：skills 仅使用 `~/.agents/skills`，不做 built-in/claude 自动同步。
}
