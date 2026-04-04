/**
 * Auth Dashboard 类型定义。
 *
 * 关键点（中文）
 * - 统一承载 dashboard authorization 页面需要的返回结构。
 * - 这是 console UI 数据面类型，不属于 auth plugin 内核协议。
 */

import type {
  ChatAuthorizationCatalog,
  ChatAuthorizationConfig,
  ChatAuthorizationSnapshot,
} from "@/shared/types/AuthPlugin.js";

/**
 * authorization 页面完整载荷。
 */
export interface AuthDashboardPayload {
  /**
   * 后端提供的授权目录定义。
   */
  catalog: ChatAuthorizationCatalog;

  /**
   * 当前静态授权配置。
   */
  config: ChatAuthorizationConfig;

  /**
   * 已观测用户列表。
   */
  users: ChatAuthorizationSnapshot["users"];

  /**
   * 已观测会话列表。
   */
  chats: ChatAuthorizationSnapshot["chats"];
}
