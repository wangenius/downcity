/**
 * Plugin tool 类型定义。
 *
 * 关键点（中文）
 * - 这里描述模型通过 plugin_call 提交的最低层调用协议。
 * - payload 保持 JSON 对象，避免 tool 层理解具体 plugin 的业务字段。
 */

import type { JsonObject } from "@/types/common/Json.js";

/**
 * plugin_call 输入。
 */
export interface PluginCallInput {
  /** 目标 plugin 名称。 */
  plugin: string;
  /** 目标 action 名称。 */
  action: string;
  /** 传给 plugin action 的 JSON payload。 */
  payload?: JsonObject;
}

/**
 * plugin_call 产生的 assistant 文件摘要。
 */
export interface PluginCallToolFileResult {
  /** 文件在本轮 assistant 文件列表中的顺序。 */
  index: number;
  /** 文件 MIME 类型，例如 `image/png`。 */
  media_type: string;
  /** 原始文件名；若上游未提供则为空字符串。 */
  filename: string;
  /** 持久化到历史消息中的资源 URL，通常为 `resources://.downcity/resources/...`。 */
  url: string;
  /** 当前机器可直接打开的绝对文件路径。 */
  path: string;
}

/**
 * plugin_call 返回给模型的摘要结果。
 */
export interface PluginCallToolResult {
  /** 调用是否成功。 */
  success: boolean;
  /** 目标 plugin 名称。 */
  plugin: string;
  /** 目标 action 名称。 */
  action: string;
  /** 本次 action 产生并写入 assistant 消息的 file part 数量。 */
  assistant_file_count: number;
  /** 本次 action 产生的文件摘要，包含可直接打开的绝对路径。 */
  files?: PluginCallToolFileResult[];
  /** 人类可读消息。 */
  message: string;
  /** 错误信息。 */
  error?: string;
  /** 返回给模型读取的短摘要数据。 */
  data?: JsonObject;
}
