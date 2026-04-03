/**
 * Web Plugin 配置读写。
 *
 * 关键点（中文）
 * - `web` 默认启用，不要求用户先在 `downcity.json` 写配置。
 * - 只有当用户显式改动时，才把 `plugins.web` 持久化到项目配置。
 */

import type { JsonObject } from "@/types/Json.js";
import type { PluginCommandContext } from "@/types/Plugin.js";
import type { ResolvedWebPluginConfig, WebPluginConfig } from "@/types/WebPlugin.js";
import { WEB_PLUGIN_DEFAULT_REPOSITORY_URL } from "@/types/WebPlugin.js";

function toJsonObject(input: Record<string, unknown> | null | undefined): JsonObject {
  const out: JsonObject = {};
  if (!input) return out;
  for (const [key, value] of Object.entries(input)) {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.filter((item) => item !== undefined) as never;
      continue;
    }
    if (value && typeof value === "object") {
      out[key] = toJsonObject(value as Record<string, unknown>);
    }
  }
  return out;
}

function readWebPluginRecord(context: PluginCommandContext): Record<string, unknown> {
  const current = context.config.plugins?.web;
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    return {};
  }
  return current as Record<string, unknown>;
}

/**
 * 读取并归一化 web plugin 配置。
 */
export function readWebPluginConfig(
  context: PluginCommandContext,
): ResolvedWebPluginConfig {
  const current = readWebPluginRecord(context) as WebPluginConfig;
  return {
    enabled: typeof current.enabled === "boolean" ? current.enabled : true,
    provider:
      current.provider === "agent-browser" || current.provider === "web-access"
        ? current.provider
        : "web-access",
    injectPrompt:
      typeof current.injectPrompt === "boolean" ? current.injectPrompt : true,
    repositoryUrl:
      typeof current.repositoryUrl === "string" && current.repositoryUrl.trim()
        ? current.repositoryUrl.trim()
        : WEB_PLUGIN_DEFAULT_REPOSITORY_URL,
    ...(typeof current.sourceVersion === "string" && current.sourceVersion.trim()
      ? { sourceVersion: current.sourceVersion.trim() }
      : {}),
    browserCommand:
      typeof current.browserCommand === "string" && current.browserCommand.trim()
        ? current.browserCommand.trim()
        : "agent-browser",
    installScope:
      current.installScope === "project" || current.installScope === "user"
        ? current.installScope
        : "user",
  };
}

/**
 * 写入 web plugin 配置。
 */
export async function writeWebPluginConfig(params: {
  context: PluginCommandContext;
  value: Partial<WebPluginConfig>;
}): Promise<ResolvedWebPluginConfig> {
  if (!params.context.config.plugins) {
    params.context.config.plugins = {};
  }
  const current = readWebPluginConfig(params.context);
  const next: WebPluginConfig = {
    ...current,
    ...params.value,
  };
  params.context.config.plugins.web = toJsonObject(
    next as unknown as Record<string, unknown>,
  );
  await params.context.pluginConfig.persistProjectPlugins(params.context.config.plugins);
  return readWebPluginConfig(params.context);
}
