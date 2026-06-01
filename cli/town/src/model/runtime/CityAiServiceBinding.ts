/**
 * Town 侧 City AIService 绑定模块。
 *
 * 关键点（中文）
 * - Town 不拥有模型池，也不解析 provider / apiKey / baseURL。
 * - 模型目录唯一来源是 City 的 AIService：`/v1/ai/models`。
 * - 运行时模型通过 User City 构造，交给 @downcity/agent 的 CityModel 适配层执行。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { City } from "@downcity/city";
import type { AgentModel } from "@downcity/agent";
import type { CityModelDescriptor } from "@downcity/type";

const CONFIG_FILE_PATH = path.join(os.homedir(), ".downcity", "config.json");
const DEFAULT_TOWN_ID = "town_downcity";

/**
 * Town 可用于连接 City AIService 的配置。
 */
export interface TownCityAiServiceConfig {
  /**
   * City HTTP 服务地址。
   */
  city_url: string;

  /**
   * 当前 Agent 调用 AIService 时使用的 town_id。
   */
  town_id: string;

  /**
   * User City 调用凭证。
   */
  user_token: string;

  /**
   * 可选 admin key，仅用于列出 admin 视角的模型目录。
   */
  admin_secret_key?: string;
}

/**
 * City AIService 模型选项。
 */
export interface CityAiModelChoice {
  /**
   * CLI 选择器展示文案。
   */
  title: string;

  /**
   * 写入 `downcity.json.execution.modelId` 的模型 ID。
   */
  value: string;

  /**
   * 原始 City 模型目录项。
   */
  model: CityModelDescriptor;
}

type DowncityClientConfig = {
  /**
   * 当前激活的 City server URL。
   */
  active_server_url?: unknown;

  /**
   * 已保存的 City server 列表。
   */
  servers?: Array<{
    /**
     * City 服务地址。
     */
    base_url?: unknown;

    /**
     * City 管理密钥。
     */
    admin_secret_key?: unknown;
  }>;
};

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function readSavedCityConfig(): {
  city_url?: string;
  admin_secret_key?: string;
} {
  if (!fs.existsSync(CONFIG_FILE_PATH)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, "utf8")) as DowncityClientConfig;
    const activeUrl = normalizeBaseUrl(readString(raw.active_server_url));
    const servers = Array.isArray(raw.servers) ? raw.servers : [];
    const activeServer = servers.find((item) => normalizeBaseUrl(readString(item.base_url)) === activeUrl)
      ?? servers[0];
    return {
      city_url: activeUrl || normalizeBaseUrl(readString(activeServer?.base_url)) || undefined,
      admin_secret_key: readString(activeServer?.admin_secret_key) || undefined,
    };
  } catch {
    return {};
  }
}

/**
 * 读取 Town 连接 City AIService 所需配置。
 *
 * 关键点（中文）
 * - 优先使用环境变量，便于 daemon / CI 显式注入。
 * - 其次复用 city CLI 的 `~/.downcity/config.json`，避免 Town 再维护一套 server 配置。
 */
export function readTownCityAiServiceConfig(
  env: NodeJS.ProcessEnv = process.env,
  options?: {
    /**
     * 是否要求 user_token 存在。
     */
    requireUserToken?: boolean;
  },
): TownCityAiServiceConfig {
  const saved = readSavedCityConfig();
  const city_url = normalizeBaseUrl(
    readString(env.DOWNCITY_CITY_URL)
    || readString(env.CITY_URL)
    || saved.city_url
    || "",
  );
  const town_id = readString(env.DOWNCITY_CITY_TOWN_ID)
    || readString(env.CITY_TOWN_ID)
    || DEFAULT_TOWN_ID;
  const user_token = readString(env.DOWNCITY_CITY_USER_TOKEN)
    || readString(env.CITY_USER_TOKEN);
  const admin_secret_key = readString(env.DOWNCITY_CITY_ADMIN_SECRET_KEY)
    || readString(env.CITY_ADMIN_SECRET_KEY)
    || saved.admin_secret_key
    || undefined;

  if (!city_url) {
    throw new Error(
      "City URL is required. Set DOWNCITY_CITY_URL or configure an active server with `city` CLI.",
    );
  }
  if (options?.requireUserToken !== false && !user_token) {
    throw new Error(
      "City user_token is required. Set DOWNCITY_CITY_USER_TOKEN before starting Town agents.",
    );
  }

  return {
    city_url,
    town_id,
    user_token,
    admin_secret_key,
  };
}

/**
 * 读取管理端模型目录。
 */
export async function listCityAiServiceModelsForAdmin(
  env: NodeJS.ProcessEnv = process.env,
): Promise<CityModelDescriptor[]> {
  const config = readTownCityAiServiceConfig(env, { requireUserToken: false });
  if (!config.admin_secret_key) {
    throw new Error(
      "City admin_secret_key is required to list models. Set DOWNCITY_CITY_ADMIN_SECRET_KEY or configure the city CLI server.",
    );
  }
  const city = new City({
    role: "admin",
    city_url: config.city_url,
    admin_secret_key: config.admin_secret_key,
  });
  return await city.listModels();
}

/**
 * 读取用户态可调用模型目录。
 */
export async function listCityAiServiceModelsForUser(
  env: NodeJS.ProcessEnv = process.env,
): Promise<CityModelDescriptor[]> {
  const config = readTownCityAiServiceConfig(env);
  const city = new City({
    role: "user",
    city_url: config.city_url,
    town_id: config.town_id,
    user_token: config.user_token,
  });
  const catalog = await city.ai.listModels();
  return catalog.all();
}

/**
 * 构建 City AIService 模型选择项。
 */
export function toCityAiModelChoices(models: CityModelDescriptor[]): CityAiModelChoice[] {
  return models.map((model) => ({
    title: [
      model.id,
      model.name && model.name !== model.id ? `· ${model.name}` : "",
      model.modalities.length > 0 ? `· ${model.modalities.join("/")}` : "",
    ].filter(Boolean).join(" "),
    value: model.id,
    model,
  }));
}

/**
 * 读取可供 Town 绑定的 City AIService 模型选项。
 */
export async function listCityAiModelChoices(
  env: NodeJS.ProcessEnv = process.env,
): Promise<CityAiModelChoice[]> {
  const models = await listCityAiServiceModelsForUser(env);
  return toCityAiModelChoices(models);
}

/**
 * 断言 City AIService 暴露了指定 model。
 */
export async function assertCityAiModelReady(
  modelId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const id = String(modelId || "").trim();
  if (!id) throw new Error("execution.modelId is required");
  const models = await listCityAiServiceModelsForUser(env);
  if (!models.some((model) => model.id === id)) {
    throw new Error(`Model not found in City AIService: ${id}`);
  }
}

/**
 * 创建 Agent 可直接使用的 City 模型。
 */
export async function createCityAiAgentModel(input: {
  /**
   * 目标 City AIService model id。
   */
  modelId: string;

  /**
   * 宿主环境变量。
   */
  env?: NodeJS.ProcessEnv;
}): Promise<AgentModel> {
  const modelId = String(input.modelId || "").trim();
  if (!modelId) throw new Error("modelId cannot be empty");
  const config = readTownCityAiServiceConfig(input.env ?? process.env);
  const city = new City({
    role: "user",
    city_url: config.city_url,
    town_id: config.town_id,
    user_token: config.user_token,
  });
  const catalog = await city.ai.listModels();
  const model = catalog.get(modelId);
  if (!model) {
    throw new Error(`Model not found in City AIService: ${modelId}`);
  }
  return model;
}
