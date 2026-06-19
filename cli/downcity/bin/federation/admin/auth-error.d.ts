/**
 * Admin 鉴权错误工具。
 *
 * 关键说明（中文）
 * - 当 admin key 不正确或已失效时，SDK 会把请求失败包装成带 `status` 的 Error。
 * - 这里统一把 401 转成可识别的 AdminAuthError，方便外层清理缓存 session 并提示重新输入。
 */
/**
 * admin key 无效时给用户展示的统一提示。
 */
export declare const ADMIN_AUTH_INVALID_MESSAGE = "Current server admin key is incorrect or expired. Please set it again.";
/**
 * 判断服务端是否缺少新接口。
 */
export declare function isAdminNotFoundError(error: unknown): boolean;
/**
 * admin 鉴权失效错误。
 */
export declare class AdminAuthError extends Error {
    constructor(message?: string);
}
/**
 * 判断当前错误是否是 admin 鉴权失效。
 */
export declare function isAdminAuthError(error: unknown): error is AdminAuthError;
/**
 * 如果底层错误是 401，则提升为 AdminAuthError。
 */
export declare function rethrowAdminAuthError(error: unknown): void;
/**
 * 提取可展示的错误文本。
 */
export declare function adminErrorMessage(error: unknown): string;
//# sourceMappingURL=auth-error.d.ts.map