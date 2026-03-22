/**
 * Asset 类型定义。
 *
 * 关键点（中文）
 * - Asset 是插件体系里的底层资源对象。
 * - 插件只依赖 Asset 名称与句柄，不依赖模型、依赖包、下载源等实现细节。
 * - Asset 自身负责检查、安装、解析与配置读写。
 */

import type { Logger } from "@utils/logger/Logger.js";
import type { ShipConfig } from "@agent/types/ShipConfig.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";

/**
 * 允许 optional 字段的结构化配置对象。
 */
export type StructuredConfig = {
  [key: string]: JsonValue | undefined;
};

/**
 * Asset 安装输入。
 *
 * 说明（中文）
 * - 允许直接传单个 JSON 值。
 * - 也允许传带 optional 字段的结构化对象。
 */
export type AssetInstallInput = JsonValue | StructuredConfig;

/**
 * Asset 作用域。
 */
export type AssetScope = "global" | "project";

/**
 * Asset 运行时上下文。
 */
export interface AssetRuntimeLike {
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
  config: ShipConfig;
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
 * Asset 配置定义。
 */
export interface AssetConfigDefinition<T extends StructuredConfig = StructuredConfig> {
  /**
   * Asset 稳定名称。
   */
  asset: string;
  /**
   * 配置作用域。
   */
  scope: AssetScope;
  /**
   * 默认配置值。
   */
  defaultValue: T;
}

/**
 * Asset 检查结果。
 */
export interface AssetCheckResult {
  /**
   * Asset 是否可用。
   */
  available: boolean;
  /**
   * 不可用原因列表。
   */
  reasons: string[];
  /**
   * 结构化附加数据（可选）。
   */
  details?: JsonValue;
}

/**
 * Asset 安装结果。
 */
export interface AssetInstallResult {
  /**
   * 安装是否成功。
   */
  success: boolean;
  /**
   * 人类可读消息（可选）。
   */
  message?: string;
  /**
   * 结构化附加数据（可选）。
   */
  details?: JsonValue;
}

/**
 * Asset 定义。
 */
export interface Asset<
  THandle = unknown,
  TConfig extends StructuredConfig = StructuredConfig,
  TInstallInput extends AssetInstallInput = AssetInstallInput,
> {
  /**
   * Asset 稳定名称。
   */
  name: string;
  /**
   * Asset 配置作用域。
   */
  scope: AssetScope;
  /**
   * Asset 配置定义（可选）。
   */
  config?: AssetConfigDefinition<TConfig>;
  /**
   * 检查 Asset 当前是否可用。
   */
  check(
    runtime: AssetRuntimeLike,
  ): Promise<AssetCheckResult> | AssetCheckResult;
  /**
   * 安装或修复 Asset。
   */
  install(
    runtime: AssetRuntimeLike,
    input?: TInstallInput,
  ): Promise<AssetInstallResult> | AssetInstallResult;
  /**
   * 解析 Asset 句柄。
   */
  resolve(runtime: AssetRuntimeLike): Promise<THandle> | THandle;
}

/**
 * Asset 运行时视图。
 */
export interface AssetRuntimeView {
  /**
   * Asset 名称。
   */
  name: string;
  /**
   * Asset 作用域。
   */
  scope: AssetScope;
  /**
   * 是否声明了配置。
   */
  hasConfig: boolean;
}

/**
 * Asset 调用端口。
 */
export interface AssetPort {
  /**
   * 列出全部已注册 Asset。
   */
  list(): AssetRuntimeView[];
  /**
   * 检查指定 Asset。
   */
  check(assetName: string): Promise<AssetCheckResult>;
  /**
   * 安装指定 Asset。
   */
  install<TInstallInput extends AssetInstallInput = AssetInstallInput>(
    assetName: string,
    input?: TInstallInput,
  ): Promise<AssetInstallResult>;
  /**
   * 解析指定 Asset 句柄。
   */
  use<THandle = unknown>(assetName: string): Promise<THandle>;
  /**
   * 读取 Asset 配置。
   */
  getConfig<TConfig extends StructuredConfig = StructuredConfig>(
    assetName: string,
  ): Promise<TConfig | null>;
  /**
   * 更新 Asset 配置。
   */
  setConfig<TConfig extends StructuredConfig = StructuredConfig>(
    assetName: string,
    value: Partial<TConfig>,
  ): Promise<TConfig>;
}
