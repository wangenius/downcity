/**
 * Local RPC 路径工具。
 *
 * 关键点（中文）
 * - 本地受信任进程之间统一通过 IPC socket/pipe 通信。
 * - Unix 平台使用 city 全局 runtime 目录下的稳定 socket 文件，避免不同启动上下文
 *   的 `TMPDIR` 不一致，导致同一个 agent 被解析到两个不同 socket 路径。
 * - Windows 平台使用命名 pipe，并基于项目路径 hash 保证稳定唯一。
 */

import crypto from "node:crypto";
import path from "node:path";
import { getCityRuntimeDirPath } from "@/main/city/runtime/CityPaths.js";

function buildProjectDigest(projectRoot: string): string {
  return crypto
    .createHash("sha1")
    .update(path.resolve(projectRoot))
    .digest("hex")
    .slice(0, 16);
}

function buildWindowsPipeName(projectRoot: string): string {
  const digest = buildProjectDigest(projectRoot);
  return `\\\\.\\pipe\\downcity-local-${digest}`;
}

function getLocalRpcUnixDirPath(): string {
  return path.join(getCityRuntimeDirPath(), "local-rpc");
}

/**
 * 返回本地 RPC endpoint。
 */
export function getLocalRpcEndpoint(projectRoot: string): string {
  if (process.platform === "win32") {
    return buildWindowsPipeName(projectRoot);
  }
  return path.join(
    getLocalRpcUnixDirPath(),
    `downcity-local-${buildProjectDigest(projectRoot)}.sock`,
  );
}
