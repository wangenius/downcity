/**
 * control plane 前端静态资源服务辅助。
 *
 * 关键点（中文）
 * - 统一处理静态文件 Content-Type 与 SPA fallback。
 * - 不直接依赖网关类，便于后续继续拆分网关入口。
 */
import type { Context } from "hono";
/**
 * 根据路径推断静态资源 MIME。
 */
export declare function resolveControlPlaneContentType(filePath: string): string;
/**
 * 返回 control plane 前端文件或 SPA fallback。
 */
export declare function serveControlPlaneFrontendPath(params: {
    context: Context;
    publicDir: string;
    requestPath: string;
}): Promise<Response>;
//# sourceMappingURL=FrontendAssets.d.ts.map