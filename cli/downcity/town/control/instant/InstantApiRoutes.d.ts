/**
 * InstantApiRoutes：Inline Composer 即时模式路由。
 *
 * 关键点（中文）
 * - 统一暴露 `/api/ui/inline/instant-run`，避免扩展直接区分 model/acp 两套后端路径。
 * - 接口层只做轻量参数校验，具体临时 session 执行逻辑下沉到 runner。
 */
import type { Hono } from "hono";
import type { PlatformAgentOption } from "@downcity/agent";
import type { PlatformInlineInstantRunner } from "@downcity/agent";
/**
 * 注册 Inline Composer 即时模式路由。
 */
export declare function registerPlatformInstantRoutes(params: {
    app: Hono;
    resolveAgentById: (requestedAgentId: string) => Promise<PlatformAgentOption | null>;
    instantRunner?: PlatformInlineInstantRunner;
}): void;
//# sourceMappingURL=InstantApiRoutes.d.ts.map