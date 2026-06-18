/**
 * Auth 领域错误定义。
 *
 * 关键点（中文）
 * - 用统一错误类把 HTTP 状态码和业务语义绑在一起。
 * - 路由层只负责把错误转成响应，不负责猜测状态码。
 */
/**
 * Auth 业务错误。
 */
export declare class AuthError extends Error {
    /**
     * HTTP 状态码。
     */
    readonly status: number;
    constructor(message: string, status: number);
}
/**
 * 判断是否为 AuthError。
 */
export declare function isAuthError(error: unknown): error is AuthError;
//# sourceMappingURL=AuthError.d.ts.map