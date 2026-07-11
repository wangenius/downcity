/**
 * Session 模型 HTTP 路由类型。
 *
 * 关键点（中文）
 * - HTTP transport 只接收可序列化的稳定模型 ID。
 * - 运行时模型实例由 Agent 宿主 resolver 创建，不进入线协议。
 */

/** Session 模型更新请求体。 */
export interface SessionModelUpdateBody {
  /** 客户端提交的稳定模型 ID；路由负责归一化并校验非空。 */
  modelId?: unknown;
}
