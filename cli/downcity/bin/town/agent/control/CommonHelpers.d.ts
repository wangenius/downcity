/**
 * 单 agent control API 通用 helper。
 *
 * 关键点（中文）
 * - 聚合 control 路由、query/path/文本裁剪等基础工具。
 * - 单 agent 控制面统一收敛到 `/api/control/*`。
 * - 不依赖任何业务状态。
 */
/**
 * 单 agent control API 的公开路由前缀。
 *
 * 说明（中文）
 * - 单 agent 控制面只暴露 `/api/control/*`。
 */
export declare const CONTROL_API_ROUTE_PREFIXES: readonly ["/api/control"];
/**
 * 为同一个 control 端点生成公开路径别名。
 */
export declare function buildControlRouteAliases(suffix: string): string[];
/**
 * 解析 limit 参数并做边界裁剪。
 */
export declare function toLimit(raw: string | undefined, fallback?: number): number;
/**
 * 转成可选字符串。
 */
export declare function toOptionalString(input: unknown): string | undefined;
/**
 * 安全 decodeURIComponent。
 */
export declare function decodeMaybe(value: string): string;
/**
 * 文本截断。
 */
export declare function truncateText(text: string, maxChars: number): string;
//# sourceMappingURL=CommonHelpers.d.ts.map