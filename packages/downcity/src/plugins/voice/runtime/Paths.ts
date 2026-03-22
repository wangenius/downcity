import path from "node:path";
import os from "node:os";

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
