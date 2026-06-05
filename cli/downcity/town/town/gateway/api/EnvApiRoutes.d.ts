/**
 * 平台环境变量管理路由。
 *
 * 关键点（中文）
 * - 当前只提供平台全局 env 的统一读写接口。
 * - 所有 value 在 DB 中以密文存储，这里的接口只负责明文读写与删除。
 */
import type { Hono } from "hono";
/**
 * 注册 Env 管理 API 路由。
 */
export declare function registerPlatformEnvRoutes(params: {
    /**
     * Hono 应用实例。
     */
    app: Hono;
}): void;
//# sourceMappingURL=EnvApiRoutes.d.ts.map