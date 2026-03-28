/**
 * ExecutionContext 类型定义。
 *
 * 关键点（中文）
 * - 这是 service / plugin 共用的最小执行上下文。
 * - 只保留路径、配置、环境与日志这些稳定底座能力。
 * - 不承载 session、plugin、dependency 等更高层语义端口。
 */

import type { Logger } from "@utils/logger/Logger.js";
import type { DowncityConfig } from "@agent/types/DowncityConfig.js";
import type { JsonValue } from "@/types/Json.js";

/**
 * 统一执行上下文。
 */
export interface ExecutionContext {
  /**
   * 当前命令工作目录。
   */
  cwd: string;
  /**
   * 当前项目根目录。
   */
  rootPath: string;
  /**
   * 统一日志器。
   */
  logger: Logger;
  /**
   * 当前运行时已解析配置。
   */
  config: DowncityConfig;
  /**
   * 当前项目环境变量快照。
   */
  env: Record<string, string>;
  /**
   * 当前生效的 system 文本集合。
   */
  systems: string[];
}

/**
 * 允许 optional 字段的结构化配置对象。
 */
export type StructuredConfig = {
  [key: string]: JsonValue | undefined;
};
