/**
 * Shell HTTP 路由。
 *
 * 关键点（中文）
 * - shell 已经是 Agent 内建能力，不再通过 plugin action 审批。
 * - 这里只暴露前端/RemoteAgent 需要的 approval 操作。
 */
import { Hono } from "hono";
import type { Shell } from "@downcity/shell";
type ShellRouterOptions = {
    /**
     * 读取当前 Shell。
     */
    getShell: () => Shell | undefined;
};
/**
 * 创建 shell approval router。
 */
export declare function createShellRouter(options: ShellRouterOptions): Hono;
export {};
//# sourceMappingURL=shell.d.ts.map