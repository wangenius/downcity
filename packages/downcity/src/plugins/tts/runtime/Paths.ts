/**
 * TTS 模型目录路径辅助。
 *
 * 关键点（中文）
 * - 统一把相对路径、`~` 与默认目录解析成绝对路径。
 */

import os from "node:os";
import path from "node:path";

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
export function resolveTtsModelsRootDir(input: {
  /**
   * 项目根目录。
   */
  projectRoot: string;
  /**
   * 用户显式配置的模型目录（可选）。
   */
  modelsDir?: string;
}): string {
  const fallback = path.join(os.homedir(), ".downcity", "models", "tts");
  const raw = expandHomePath(String(input.modelsDir || fallback).trim());
  if (!raw) return path.resolve(fallback);
  if (path.isAbsolute(raw)) return path.resolve(raw);
  return path.resolve(input.projectRoot, raw);
}
