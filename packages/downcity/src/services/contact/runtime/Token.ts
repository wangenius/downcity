/**
 * contact token 工具。
 *
 * 关键点（中文）
 * - contact 之间的远端调用使用随机 token。
 * - 本地只保存入站 token hash，避免明文泄漏后可被直接冒用。
 */

import crypto from "node:crypto";

/**
 * 生成随机 token。
 */
export function createContactToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * 计算 token hash。
 */
export function hashContactToken(token: string): string {
  return crypto.createHash("sha256").update(String(token || ""), "utf-8").digest("hex");
}

/**
 * 生成短 id。
 */
export function createContactId(prefix: string): string {
  const cleanPrefix = String(prefix || "id").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${cleanPrefix}_${crypto.randomBytes(5).toString("hex")}`;
}

/**
 * 稳定 slug。
 */
export function toContactSlug(input: string): string {
  const raw = String(input || "").trim().toLowerCase();
  const slug = raw.replace(/[^a-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || createContactId("contact");
}
