/**
 * 项目执行绑定类型定义（api 模式）。
 *
 * 关键点（中文）
 * - 项目运行入口只有一种执行模式：`api`。
 * - 绑定 console 全局模型池中的模型 ID。
 * - 该类型是项目 `downcity.json` 中唯一的执行配置。
 */

/**
 * 项目执行绑定配置（api 模式）。
 */
export interface ExecutionBindingConfig {
  /**
   * 执行模式类型，固定为 `api`。
   */
  type: "api";

  /**
   * console 全局模型池中的模型 ID。
   *
   * 说明（中文）
   * - 必须能在 `~/.downcity/downcity.db` 的模型池中解析到。
   * - 例如：`default`、`fast`、`quality`。
   */
  modelId: string;
}
