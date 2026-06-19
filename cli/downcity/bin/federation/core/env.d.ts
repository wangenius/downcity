/**
 * 运行时工具模块。
 *
 * 提供 CLI 参数解析、URL 规范化等基础设施。
 */
export declare const DEFAULT_HOST = "127.0.0.1";
export declare const DEFAULT_PORT = 43127;
export declare const DEFAULT_BASE_URL = "https://base.downcity.ai";
export declare const DEFAULT_BAY_ID = "city_downcity";
export declare function parseArgs(argv: string[]): {
    command: string;
    options: Record<string, string | boolean>;
};
export declare function normalizeBaseUrl(baseUrl: string): string;
//# sourceMappingURL=env.d.ts.map