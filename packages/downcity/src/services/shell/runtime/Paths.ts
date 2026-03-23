/**
 * Shell service 路径工具。
 *
 * 关键点（中文）
 * - shell 运行产物统一落在 `.ship/shell/<shellId>/`。
 * - 目录结构简单稳定，便于调试与后续恢复。
 */

import path from "node:path";

export function getShellRootDir(projectRoot: string): string {
  return path.join(projectRoot, ".ship", "shell");
}

export function getShellDir(projectRoot: string, shellId: string): string {
  return path.join(getShellRootDir(projectRoot), String(shellId || "").trim());
}

export function getShellSnapshotPath(
  projectRoot: string,
  shellId: string,
): string {
  return path.join(getShellDir(projectRoot, shellId), "snapshot.json");
}

export function getShellOutputPath(projectRoot: string, shellId: string): string {
  return path.join(getShellDir(projectRoot, shellId), "output.log");
}
