/**
 * `town model` 支撑工具。
 *
 * 关键点（中文）
 * - 只保留项目路径解析与 `execution.modelId` 绑定写入。
 * - Town 不发现 provider 模型，也不写入本地模型池。
 */

import fs from "fs-extra";
import path from "node:path";
import { getDowncityJsonPath } from "@/config/Paths.js";
import type { DowncityConfig } from "@downcity/agent";

/**
 * 解析项目根目录。
 */
export function resolveProjectRoot(pathInput?: string): string {
  return path.resolve(String(pathInput || "."));
}

/**
 * 设置项目 `downcity.json.execution.modelId`。
 *
 * 关键点（中文）
 * - 仅更新绑定字段，不触碰其他运行配置。
 * - 该操作用于把“City AIService 中的模型 ID”绑定到具体 agent 项目。
 */
export function setProjectPrimaryModel(projectRoot: string, modelId: string): {
  shipJsonPath: string;
  previousPrimary: string;
  nextPrimary: string;
} {
  const shipJsonPath = getDowncityJsonPath(projectRoot);
  if (!fs.existsSync(shipJsonPath)) {
    throw new Error(`downcity.json not found at ${shipJsonPath}`);
  }
  const raw = fs.readJsonSync(shipJsonPath) as Partial<DowncityConfig>;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Invalid downcity.json: expected object (${shipJsonPath})`);
  }
  const previousPrimary =
    String(raw.execution?.type === "api" ? raw.execution.modelId || "" : "").trim();
  const nextPrimary = String(modelId || "").trim();
  if (!nextPrimary) throw new Error("modelId cannot be empty");
  const nextConfig: DowncityConfig = {
    ...(raw as DowncityConfig),
    execution: {
      type: "api",
      modelId: nextPrimary,
    },
  };
  fs.writeJsonSync(shipJsonPath, nextConfig, { spaces: 2 });
  return {
    shipJsonPath,
    previousPrimary,
    nextPrimary,
  };
}
