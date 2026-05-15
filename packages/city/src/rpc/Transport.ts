/**
 * City RPC Transport 包级转发入口。
 *
 * 关键点（中文）
 * - 远程调用统一走 `@downcity/agent` 的 transport。
 * - 减少 city 与 agent 在协议层的重复实现。
 */

export { callAgentTransport } from "@downcity/agent";
