/**
 * Agent 模型绑定配置。
 *
 * 关键点（中文）
 * - agent 侧不再维护 provider/models 细节。
 * - 仅声明“当前 agent 使用哪个 console 全局模型 ID”。
 * - 实际模型池由 `~/.ship/ship.json` 的 `llm` 统一管理。
 */
export interface AgentModelBindingConfig {
  /**
   * 当前 agent 绑定的主模型 ID。
   *
   * 说明（中文）
   * - 该值必须能在 console 全局配置 `llm.models` 中找到同名 key。
   * - 例如：`default`、`fast`、`quality`。
   */
  primary: string;
}

