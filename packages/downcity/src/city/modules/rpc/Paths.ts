/**
 * Local RPC 路径工具。
 *
 * 关键点（中文）
 * - 本地受信任进程之间统一通过 IPC socket/pipe 通信。
 * - Unix 平台使用临时目录下的稳定 socket 文件，避免项目路径过长导致 bind 失败。
 * - Windows 平台使用命名 pipe，并基于项目路径 hash 保证稳定唯一。
 */

import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

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

/**
 * 返回本地 RPC endpoint。
 */
export function getLocalRpcEndpoint(projectRoot: string): string {
  if (process.platform === "win32") {
    return buildWindowsPipeName(projectRoot);
  }
  return path.join(os.tmpdir(), `downcity-local-${buildProjectDigest(projectRoot)}.sock`);
}
