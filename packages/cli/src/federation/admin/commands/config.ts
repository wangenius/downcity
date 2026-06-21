/**
 * 旧的 Admin Server URL 命令兼容壳。
 *
 * 关键说明（中文）
 * - 新交互下，server 管理已经提升到当前 City 的 server management
 * - 这里保留空壳是为了避免历史导入直接报错
 */

import { type AdminSession } from "@/federation/core/session.js";

export async function changeServerUrl(_session: AdminSession): Promise<boolean> {
  return false;
}
