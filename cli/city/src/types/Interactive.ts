/**
 * 交互式 City CLI 的流程类型定义。
 *
 * 关键说明（中文）
 * - 顶层不再以 admin / user 身份作为首页主分流
 * - 首页围绕 City server 与当前工作区展开
 * - admin 只作为低频的 server management 能力出现
 */

/**
 * 首次进入 CLI 且本地没有任何 City server 时的动作。
 */
export type WelcomeAction = "connect_city" | "update" | "quit";

/**
 * 已经存在至少一个 City server 时的首页动作。
 */
export type HomeAction =
  | "open_current"
  | "switch_city"
  | "connect_city"
  | "update"
  | "quit";

/**
 * 当前 City 还没有 user session 时，工作区允许的动作。
 */
export type ServerEntryAction =
  | "sign_in"
  | "server_management"
  | "back"
  | "quit";

/**
 * server management 子菜单的退出结果。
 */
export type ServerManagementResult = "back" | "quit";
