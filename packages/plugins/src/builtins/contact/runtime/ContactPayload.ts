/**
 * contact payload 解析工具。
 *
 * 关键点（中文）
 * - contact 的 CLI 与远端 HTTP action 都会接收宽松 JSON 输入。
 * - 这里统一收口对象、字符串与 contact token 读取，避免 action 注册表重复解析细节。
 */

import type { JsonObject, JsonValue } from "@downcity/agent/internal/types/common/Json.js";

/**
 * 将任意 JSON 值安全读取为对象。
 */
export function readContactObject(value: JsonValue): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

/**
 * 从 JSON 对象中读取并裁剪字符串字段。
 */
export function readContactString(body: JsonObject, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}
