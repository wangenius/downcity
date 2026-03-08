import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { getShipJsonPath } from "@/main/server/env/Paths.js";
import type { ShipConfig } from "@/main/types/ShipConfig.js";
import type { VoiceModelId, VoiceExtensionConfig } from "@/main/types/Voice.js";

/**
 * 保障 `extensions.voice` 结构存在并返回可写对象。
 */
export function ensureVoiceExtensionConfig(config: ShipConfig): VoiceExtensionConfig {
  if (!config.extensions) config.extensions = {};
  if (!config.extensions.voice) config.extensions.voice = {};
  return config.extensions.voice;
}

/**
 * 去重模型 ID 列表（保留原顺序）。
 */
export function dedupeVoiceModelIds(modelIds: VoiceModelId[]): VoiceModelId[] {
  const seen = new Set<VoiceModelId>();
  const out: VoiceModelId[] = [];
  for (const item of modelIds) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

/**
 * 将绝对路径转为相对项目根目录的可移植路径（POSIX slash）。
 */
export function toPortableRelativePath(
  projectRoot: string,
  absolutePath: string,
): string {
  const project = path.resolve(projectRoot);
  const absolute = path.resolve(absolutePath);
  if (
    absolute !== project &&
    !absolute.startsWith(`${project}${path.sep}`)
  ) {
    return absolute.replace(/\\/g, "/");
  }

  const relative = path.relative(project, absolute);
  if (!relative) return ".";
  return relative.replace(/\\/g, "/");
}

function expandHomePath(inputPath: string): string {
  const raw = String(inputPath || "").trim();
  if (!raw) return raw;
  if (raw === "~") return os.homedir();
  if (raw.startsWith("~/")) {
    return path.join(os.homedir(), raw.slice(2));
  }
  return raw;
}

/**
 * 将相对路径解析为绝对路径；空值时回退默认目录。
 */
export function resolveVoiceModelsRootDir(input: {
  projectRoot: string;
  modelsDir?: string;
}): string {
  const fallback = path.join(os.homedir(), ".ship", "models", "voice");
  const raw = expandHomePath(String(input.modelsDir || fallback).trim());
  if (!raw) return path.resolve(fallback);
  if (path.isAbsolute(raw)) return path.resolve(raw);
  return path.resolve(input.projectRoot, raw);
}

/**
 * 把内存中的 ship 配置写回磁盘。
 *
 * 关键点（中文）
 * - voice extension 在 daemon 运行时也能实时修改配置。
 * - 落盘后与 `context.config` 保持同一对象引用，不需要二次加载。
 */
export async function persistShipConfig(params: {
  projectRoot: string;
  config: ShipConfig;
}): Promise<string> {
  const shipJsonPath = getShipJsonPath(params.projectRoot);
  await fs.writeJson(shipJsonPath, params.config, { spaces: 2 });
  return shipJsonPath;
}
