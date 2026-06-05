/**
 * 旧 Console gateway 前端静态资源服务辅助。
 *
 * 关键点（中文）
 * - 当前 Town CLI 不再打包 Console UI 静态资源。
 * - 这里仅为历史 gateway 门面保留静态文件 Content-Type 与 SPA fallback。
 * - 不直接依赖网关类，便于后续继续拆分网关入口。
 */
import type { Context } from "hono";
/**
 * 根据路径推断静态资源 MIME。
 */
export declare function resolveGatewayContentType(filePath: string): string;
/**
 * 返回 gateway 前端文件或 SPA fallback。
 */
export declare function serveGatewayFrontendPath(params: {
    context: Context;
    publicDir: string;
    requestPath: string;
}): Promise<Response>;
//# sourceMappingURL=FrontendAssets.d.ts.map