/**
 * contact endpoint 提示类型。
 *
 * 关键点（中文）
 * - endpoint 可达性只用于给 agent / 用户解释当前联系码适合谁使用。
 * - 它不参与鉴权，鉴权仍由 link secret 与 contact token 完成。
 */

/**
 * contact endpoint 的粗粒度可达范围。
 */
export type ContactEndpointReachability =
  | "loopback"
  | "private"
  | "public"
  | "unknown";
