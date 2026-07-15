/**
 * Plugin 配置协议类型。
 */

import type { JsonValue } from "@/types/common/Json.js";

/**
 * 允许 optional 字段的结构化 Plugin 配置对象。
 */
export type StructuredConfig = {
  /** 当前配置字段；省略或 `undefined` 表示未配置。 */
  [key: string]: JsonValue | undefined;
};
