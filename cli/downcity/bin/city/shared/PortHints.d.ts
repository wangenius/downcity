/**
 * CLI 端口提示文案。
 *
 * 关键点（中文）
 * - 统一管理用户可见的端口职责说明，避免不同命令里文案漂移。
 * - 这里只输出“用户该怎么理解端口”，不参与任何监听或分配逻辑。
 */
export declare const DEFAULT_RUNTIME_API_PORT = 5314;
export declare const DEFAULT_GATEWAY_UI_PORT = 5315;
/**
 * 生成 city runtime 启动提示。
 */
export declare function buildRuntimePortFacts(): Array<{
    label: string;
    value: string;
}>;
/**
 * 生成 gateway 启动提示。
 */
export declare function buildGatewayPortFacts(url: string, options?: {
    publicUrl?: string | null;
}): Array<{
    label: string;
    value: string;
}>;
/**
 * 生成 gateway 启动提示。
 */
export declare function buildGatewayPortFactsWithOptions(url: string, options?: {
    publicUrl?: string | null;
}): Array<{
    label: string;
    value: string;
}>;
//# sourceMappingURL=PortHints.d.ts.map