/**
 * 管理端类型。
 */

import type { FetchLike } from "../http.js";
import type { CityModelDescriptor } from "@downcity/type";
import type { UserServiceSummary } from "../user/types.js";

/** Admin City 内部访问层构造参数 */
export interface AdminPactAccessOptions {
  /** City 管理端入口地址，支持 `http(s)://` 与本机 `rpc://`。 */
  base_url: string;

  /**
   * 当前管理的 City ID。
   *
   * 传入后 token 签发等服务会自动使用该 ID，调用方无需再传 city_id。
   */
  city_id: string;

  /** 管理密钥；使用本机 `rpc://` 时不需要传入。 */
  admin_secret_key?: string;
  /** 自定义 fetch 实现 */
  fetch?: FetchLike;
}

/**
 * 管理端可见的 Service 摘要。
 *
 * 复用统一 Service 目录结构：
 * - `id` / `name` 用于展示可调用模块
 * - `env` 用于提示当前模块依赖的配置项
 */
export type AdminServiceSummary = UserServiceSummary;

/**
 * 管理端可见的模型目录记录。
 *
 * 复用统一模型目录结构；admin 身份下会额外看到：
 * - `env_requirements`
 */
export type AdminModelRecord = CityModelDescriptor;

/**
 * City 聚合说明文档结果。
 */
export interface AdminInstructionResult {
  /**
   * 供管理端直接阅读的纯文本说明。
   */
  text: string;
}
