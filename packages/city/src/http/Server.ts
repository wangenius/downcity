/**
 * City HTTP Server 包级转发入口。
 *
 * 关键点（中文）
 * - city 主 HTTP 服务统一复用 `@downcity/agent` 的 server 装配。
 * - 避免 city 与 agent 包继续维护两套重复路由树。
 */

export { startServer } from "@downcity/agent";
