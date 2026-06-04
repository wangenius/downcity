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
  /** 人类可读消息。 */
  message: string;
  /** 错误信息。 */
  error?: string;
  /** 返回给模型读取的短摘要数据。 */
  data?: JsonObject;
}
