/**
 * `town model` 支撑工具。
 *
 * 关键点（中文）
 * - 收敛“路径处理、provider 模型发现、项目 model 绑定写入”等可复用逻辑。
 * - 让命令编排文件保持在可维护规模内。
 */
import type { LlmProviderType } from "@downcity/agent";
export type ProviderDiscoveryResult = {
    providerId: string;
    providerType: LlmProviderType;
    ok: boolean;
    status?: number;
    models: string[];
    error?: string;
};
export declare function resolveProviderDefaultBaseUrl(providerType: LlmProviderType): string | undefined;
export declare function normalizeBaseUrl(value: string | undefined): string | undefined;
export declare function extractModelIdsFromPayload(payload: unknown): string[];
export declare function discoverProviderModels(params: {
    providerId: string;
    providerType: LlmProviderType;
    baseUrl?: string;
    apiKey?: string;
}): Promise<ProviderDiscoveryResult>;
/**
 * 解析项目根目录。
 *
 * 关键点（中文）
 * - `town model use --path` 只需要一个纯路径解析能力。
 * - 不再依赖 Town plugin 的目标解析模块，避免模型配置能力耦合 agent 目标解析。
 */
export declare function resolveProjectRoot(pathInput?: string): string;
/**
 * 设置项目 `downcity.json.execution.modelId`。
 *
 * 关键点（中文）
 * - 仅更新绑定字段，不触碰其他运行配置。
 * - 该操作用于把“模型池中的模型 ID”绑定到具体 agent 项目。
 */
export declare function setProjectPrimaryModel(projectRoot: string, modelId: string): {
    shipJsonPath: string;
    previousPrimary: string;
    nextPrimary: string;
};
//# sourceMappingURL=ModelSupport.d.ts.map