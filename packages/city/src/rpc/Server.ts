/**
 * City Local RPC Server 包级转发入口。
 *
 * 关键点（中文）
 * - 本地 RPC server 统一复用 `@downcity/agent` 的实现。
 * - city 不再保留独立的本机 IPC 路由装配。
 */

export { startLocalRpcServer } from "@downcity/agent";
