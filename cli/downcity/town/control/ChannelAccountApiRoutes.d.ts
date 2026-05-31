/**
 * 平台 Channel Account 路由。
 *
 * 关键点（中文）
 * - 提供全局 channel account 管理接口。
 * - 仅暴露脱敏字段，不返回明文密钥。
 */
import type { Hono } from "hono";
/**
 * 注册 Channel Account API 路由。
 */
export declare function registerPlatformChannelAccountRoutes(params: {
    app: Hono;
}): void;
//# sourceMappingURL=ChannelAccountApiRoutes.d.ts.map