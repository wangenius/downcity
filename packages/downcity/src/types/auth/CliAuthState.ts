/**
 * CLI 本地认证状态类型。
 *
 * 关键点（中文）
 * - 仅描述 CLI/agent shell 复用的“当前 Bearer Token 登录态”。
 * - 不把 session/chat 上下文混进认证状态，避免身份与执行上下文耦合。
 */

/**
 * CLI 本地认证状态。
 */
export interface CliAuthState {
  /**
   * 当前保存的明文 Bearer Token。
   */
  token: string;
  /**
   * 当前 token 对应的用户名（可选）。
   */
  username?: string;
  /**
   * token 写入本地存储的来源（可选）。
   */
  source?: "bootstrap" | "login" | "manual" | "runtime";
  /**
   * 最近一次写入本地存储的时间。
   */
  updatedAt: string;
}
