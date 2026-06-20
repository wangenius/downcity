/**
 * Token 命令输出渲染模块。
 *
 * 关键点（中文）
 * - 统一负责 token 列表、详情、创建成功等文本输出。
 * - 支持 JSON 与人类可读两种模式。
 */
import type { AuthIssuedToken, AuthTokenSummary } from "@downcity/agent";
/**
 * 打印 token 列表。
 */
export declare function printTokenList(tokens: AuthTokenSummary[], json?: boolean): void;
/**
 * 渲染单个 token 详情。
 */
export declare function emitTokenDetail(token: AuthTokenSummary): void;
/**
 * 渲染 token 创建成功后的接入说明。
 */
export declare function emitTokenSetupGuide(token: AuthIssuedToken): void;
//# sourceMappingURL=TokenRender.d.ts.map