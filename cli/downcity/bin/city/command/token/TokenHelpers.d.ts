/**
 * Token 命令通用工具函数。
 *
 * 关键点（中文）
 * - 负责 token 状态判断、格式化与剪贴板等纯工具逻辑。
 * - 不依赖任何交互流程，可被渲染与动作模块复用。
 */
import type { AuthTokenSummary } from "@downcity/agent";
/**
 * 当前是否为交互式终端。
 */
export declare function isInteractiveTerminal(): boolean;
/**
 * 判断 token 是否已过期。
 */
export declare function isTokenExpired(token: AuthTokenSummary): boolean;
/**
 * 解析 token 状态。
 */
export declare function resolveTokenState(token: AuthTokenSummary): "active" | "expired";
/**
 * 格式化 token 状态标签。
 */
export declare function formatTokenStateLabel(token: AuthTokenSummary): string;
/**
 * 根据 token 状态解析视觉语气。
 */
export declare function resolveTokenTone(token: AuthTokenSummary): "accent" | "warning";
/**
 * 构建 token 详情事实列表。
 */
export declare function buildTokenFacts(token: AuthTokenSummary): Array<{
    label: string;
    value: string;
}>;
/**
 * 复制文本到系统剪贴板。
 *
 * 关键点（中文）
 * - 依次尝试 pbcopy / wl-copy / xclip / clip。
 * - 返回使用的后端命令，便于提示用户。
 */
export declare function copyTextToClipboard(text: string): {
    success: boolean;
    backend?: string;
};
//# sourceMappingURL=TokenHelpers.d.ts.map