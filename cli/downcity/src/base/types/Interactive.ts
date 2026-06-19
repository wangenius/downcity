/**
 * 交互式 City CLI 的流程类型定义。
 *
 * 关键说明（中文）
 * - `city` 只负责 City base 与 admin 管理。
 * - user 登录与 runtime 入口由 `city` 负责。
 */

/**
 * 首次进入 CLI 且本地没有任何 City server 时的动作。
 */
export type WelcomeAction = "connect_city" | "more" | "quit";

/**
 * 已经存在至少一个 City server 时的首页动作。
 */
export type HomeAction =
  | "connect_city"
  | "more"
  | "quit"
  | `open_server:${string}`;
