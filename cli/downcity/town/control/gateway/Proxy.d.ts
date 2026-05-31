/**
 * 平台控制面代理转发辅助。
 *
 * 关键点（中文）
 * - 负责把 `/api/*` 请求转发到选中 agent。
 * - 保持最小职责，不参与 agent 选择逻辑。
 */
/**
 * 构造上游请求地址。
 */
export declare function buildPlatformUpstreamUrl(requestUrl: URL, baseUrl: string): string;
/**
 * 转发请求到目标 runtime。
 */
export declare function forwardPlatformRequest(request: Request, upstreamUrl: string): Promise<Response>;
//# sourceMappingURL=Proxy.d.ts.map