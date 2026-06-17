/**
 * AgentHttpGateway：Town 托管的 Agent HTTP 网关。
 *
 * 职责说明（中文）
 * - 由 `town agent start` 启动 HTTP 入口，对外承载控制面、plugin 与 SDK HTTP 路由。
 * - Agent 进程本体只暴露本机 RPC；HTTP server 生命周期归 Town CLI 管理。
 * - HTTP route 实现放在 Town 内部，Agent 只提供 runtime/context/sessionCollection。
 */
import { Hono } from "hono";
import http from "node:http";
import type { Hono as HonoType } from "hono";
import type { AgentRuntime } from "@downcity/agent/internal/types/runtime/agent/AgentRuntime.js";
import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
import type { Shell } from "@downcity/shell";
/**
 * Agent HTTP 网关启动参数。
 */
export interface AgentHttpGatewayStartOptions {
    /** HTTP 服务监听端口。 */
    port: number;
    /** HTTP 服务监听主机。 */
    host: string;
    /** 当前 agent runtime 读取函数。 */
    getAgentRuntime: () => AgentRuntime;
    /** 当前 agent context 读取函数。 */
    getAgentContext: () => AgentContext;
    /** 可选 SDK transport 子路由（来自 `@downcity/server` 的 `AgentHTTP.router()`）。 */
    sdkRouter?: HonoType;
    /** 可选 Shell 绑定。 */
    getShell?: () => Shell | undefined;
}
/**
 * Agent HTTP 网关运行实例。
 */
export interface AgentHttpGatewayInstance {
    /** Hono 应用实例。 */
    app: Hono;
    /** 原生 HTTP Server 实例。 */
    server: http.Server;
    /** 停止当前服务。 */
    stop(): Promise<void>;
}
/**
 * 创建 Agent HTTP 网关 Hono 应用。
 */
export declare function createAgentHttpGatewayApp(options: Pick<AgentHttpGatewayStartOptions, "getAgentRuntime" | "getAgentContext" | "sdkRouter" | "getShell">): Hono;
/**
 * 启动 Town 托管的 Agent HTTP 网关。
 */
export declare function startAgentHttpGateway(options: AgentHttpGatewayStartOptions): Promise<AgentHttpGatewayInstance>;
//# sourceMappingURL=AgentHttpGateway.d.ts.map