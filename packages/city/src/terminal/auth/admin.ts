/**
 * Admin 鉴权模块。
 *
 * 当前版本直接复用当前 active server 上保存的 admin_secret_key。
 */

import { type AdminSession, type ServerProfile } from "../core/session.js";
import { showError } from "../core/ui.js";

export async function adminAuth(server: ServerProfile): Promise<AdminSession | undefined> {
  const adminSecretKey = String(server.admin_secret_key ?? "").trim();
  if (!adminSecretKey) {
    showError("Current server is missing admin_secret_key. Use Manage Servers -> Edit Server.");
    return undefined;
  }

  return {
    base_url: server.base_url,
    admin_token: adminSecretKey,
  };
}
