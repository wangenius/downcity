/**
 * Admin 鉴权模块。
 *
 * 当前版本直接复用当前 active server 上保存的 admin_secret_key。
 */

import { type AdminSession, type ServerProfile } from "../core/session.js";
import { showError } from "../core/ui.js";
import { t } from "../i18n.js";

export async function adminAuth(server: ServerProfile): Promise<AdminSession | undefined> {
  const adminSecretKey = String(server.admin_secret_key ?? "").trim();
  if (!adminSecretKey) {
    showError(t({
      zh: "当前 City 缺少 admin_secret_key。",
      en: "Current City is missing admin_secret_key.",
    }));
    return undefined;
  }

  return {
    base_url: server.base_url,
    admin_secret_key: adminSecretKey,
  };
}
