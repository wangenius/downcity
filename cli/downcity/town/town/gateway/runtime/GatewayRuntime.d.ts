/**
 * `town console`：Town gateway 进程管理与前台运行入口。
 *
 * 关键点（中文）
 * - 默认 `town console` 等同于 `town console start`。
 * - `run` 仅供内部使用（真正启动 gateway 进程）。
 * - 这里管理的是 Town gateway，不是单 agent control API。
 */
import type { ControlPlaneRuntimeStatus as GatewayRuntimeStatus } from "@downcity/agent";
/**
 * gateway 模块启动参数。
 */
export interface GatewayStartOptions {
    /**
     * 是否以公网模式暴露 Town gateway。
     */
    public?: boolean;
    /**
     * Town gateway 监听端口。
     */
    port?: number;
    /**
     * Town gateway 监听主机。
     */
    host?: string;
}
/**
 * 安全读取 gateway pid。
 */
export declare function readGatewayPid(): Promise<number | null>;
/**
 * 判断两个 Console 绑定端点是否一致。
 *
 * 关键点（中文）
 * - `127.0.0.1` 和 `0.0.0.0` 不能视为同一个绑定端点。
 * - 这是 `start -p` 是否已经生效的核心判断，避免本机监听被误报成公网监听。
 */
export declare function isGatewayBindingMatch(actualHost: string, expectedHost: string): boolean;
/**
 * 解析 Console 实际监听 host。
 *
 * 关键点（中文）
 * - 用户显式传 `--host` 时，始终尊重显式值。
 * - 传 `--public` 时，默认切到 `0.0.0.0`，方便服务器直接对外暴露。
 * - 未传 host/public 时，仍保持本机模式 `127.0.0.1`。
 */
export declare function resolveGatewayHostForBinding(options?: GatewayStartOptions): string;
/**
 * 解析 detached Console 命令行中的 host/port。
 */
export declare function parseGatewayProcessCommand(command: string): {
    host: string;
    port: number;
} | null;
/**
 * 从 detached 进程列表中挑选可复用的 Console 进程。
 */
export declare function findReusableGatewayProcess(processes: Array<{
    pid: number;
    command: string;
}>, expected: {
    host?: string;
    port: number;
}): {
    pid: number;
    host: string;
    port: number;
} | null;
/**
 * 获取 Console 当前运行状态。
 */
export declare function getGatewayRuntimeStatus(): Promise<GatewayRuntimeStatus>;
/**
 * 前台运行 Console 网关（内部 run 命令）。
 */
export declare function runGatewayRuntimeCommand(options?: GatewayStartOptions): Promise<void>;
export declare function startGatewayRuntimeCommand(params: {
    options?: GatewayStartOptions;
    cliPath: string;
}): Promise<void>;
/**
 * 重启后台 Console。
 *
 * 关键点（中文）
 * - 先 stop 再 start，保证加载最新代码与路由。
 * - 支持通过 options 覆盖 host/port。
 */
export declare function restartGatewayRuntimeCommand(params: {
    options?: GatewayStartOptions;
    cliPath: string;
}): Promise<void>;
/**
 * 停止后台 Console。
 */
export declare function stopGatewayRuntimeCommand(params?: {
    timeoutMs?: number;
}): Promise<void>;
//# sourceMappingURL=GatewayRuntime.d.ts.map