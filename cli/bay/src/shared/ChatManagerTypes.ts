/**
 * `bay chat` 交互式 manager 类型。
 */

export type ChatManagerRootAction =
  | "status"
  | "start"
  | "stop"
  | "restart"
  | "configureChannels"
  | "exit";

export type ChatChannelAccountAction =
  | "list"
  | "add"
  | "edit"
  | "remove"
  | "configureAuthorization"
  | "back";
