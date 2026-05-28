/**
 * Plugin 项目配置持久化工具。
 *
 * 关键点（中文）
 * - 新插件体系的用户配置统一写回项目 `downcity.json`。
 * - 这里只负责 `plugins` 配置域，避免把执行期合并态整包落盘。
 * - 这样既能保证重启后配置仍然生效，也能避免把平台全局配置误写进项目文件。
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { DowncityConfig } from "@/types/config/DowncityConfig.js";
import type { AgentPluginConfigRuntime } from "@/types/runtime/host/AgentHost.js";

type PersistableSections = {
  /**
   * 插件配置块（可选）。
   */
  plugins?: DowncityConfig["plugins"];
};

type ProjectPluginConfigCarrier = {
  /**
   * 当前项目配置对象。
   */
  config: DowncityConfig;
  /**
   * plugin 配置持久化能力。
   */
  pluginConfig: AgentPluginConfigRuntime;
};

function getProjectDowncityJsonPath(projectRoot: string): string {
  return path.join(path.resolve(projectRoot), "downcity.json");
}

async function readProjectDowncityConfig(projectRoot: string): Promise<DowncityConfig> {
  const downcityJsonPath = getProjectDowncityJsonPath(projectRoot);
  const raw = await fs.readFile(downcityJsonPath, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid downcity.json: expected object (${downcityJsonPath})`);
  }
  return parsed as DowncityConfig;
}

function readProjectPluginRecordFromConfig(
  config: Pick<DowncityConfig, "plugins"> | null | undefined,
  pluginName: string,
): Record<string, unknown> {
  const normalizedPluginName = String(pluginName || "").trim();
  if (!normalizedPluginName) return {};
  const current = config?.plugins?.[normalizedPluginName];
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    return {};
  }
  return current as Record<string, unknown>;
}

/**
 * 从项目配置读取单个 plugin 的原始配置块。
 */
export function readProjectPluginRecord(
  config: Pick<DowncityConfig, "plugins"> | null | undefined,
  pluginName: string,
): Record<string, unknown> {
  return readProjectPluginRecordFromConfig(config, pluginName);
}

/**
 * 从项目配置读取单个 plugin 的启用态。
 *
 * 关键点（中文）
 * - 除 `auth` 外，未显式配置 `enabled: false` 时默认视为启用。
 * - 这样可以保持“零配置即可使用”的内建 plugin 体验。
 */
export function readProjectPluginEnabled(params: {
  /**
   * 项目配置对象（可选）。
   */
  config?: Pick<DowncityConfig, "plugins"> | null;
  /**
   * plugin 名称。
   */
  pluginName: string;
}): boolean {
  const normalizedPluginName = String(params.pluginName || "").trim();
  if (!normalizedPluginName) return false;
  if (normalizedPluginName === "auth") return true;
  const current = readProjectPluginRecordFromConfig(params.config, normalizedPluginName);
  return current.enabled !== false;
}

/**
 * 将单个 plugin 的启用态写回项目配置。
 *
 * 关键点（中文）
 * - 这里只维护 `plugins.<name>.enabled`，不理解插件私有字段语义。
 * - 其余配置字段会原样保留，避免开关动作覆盖插件已有设置。
 */
export async function writeProjectPluginEnabled(params: {
  /**
   * 目标 plugin 名称。
   */
  pluginName: string;
  /**
   * 目标启用态。
   */
  enabled: boolean;
  /**
   * 当前项目配置与持久化能力。
   */
  context: ProjectPluginConfigCarrier;
}): Promise<void> {
  const normalizedPluginName = String(params.pluginName || "").trim();
  if (!normalizedPluginName || normalizedPluginName === "auth") return;
  if (!params.context.config.plugins) {
    params.context.config.plugins = {};
  }
  params.context.config.plugins[normalizedPluginName] = {
    ...readProjectPluginRecordFromConfig(
      params.context.config,
      normalizedPluginName,
    ),
    enabled: params.enabled,
  };
  await params.context.pluginConfig.persistProjectPlugins(
    params.context.config.plugins,
  );
}

/**
 * 将 plugins 配置块写回项目 `downcity.json`。
 */
export async function persistProjectPluginConfig(params: {
  /**
   * 项目根目录。
   */
  projectRoot: string;
  /**
   * 待持久化的配置块。
   */
  sections: PersistableSections;
}): Promise<string> {
  const downcityJsonPath = getProjectDowncityJsonPath(params.projectRoot);
  const current = await readProjectDowncityConfig(params.projectRoot);
  const next: DowncityConfig = {
    ...current,
    ...(params.sections.plugins !== undefined
      ? { plugins: params.sections.plugins }
      : {}),
  };
  await fs.writeFile(downcityJsonPath, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  return downcityJsonPath;
}
