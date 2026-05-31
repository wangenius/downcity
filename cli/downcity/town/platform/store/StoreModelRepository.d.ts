/**
 * PlatformStore 模型与 Provider 仓储。
 *
 * 关键点（中文）
 * - 只负责 model/provider 相关读写，不处理 env、channel account、secure settings。
 * - 对外暴露纯函数，`PlatformStore` 作为门面调用。
 */
import type { StoredModel, StoredModelProvider, StoredProviderMeta, UpsertModelInput, UpsertModelProviderInput } from "@downcity/agent";
import type { PlatformStoreContext } from "./StoreShared.js";
/**
 * 列出 providers。
 */
export declare function listStoredProviders(context: PlatformStoreContext): Promise<StoredModelProvider[]>;
/**
 * 同步列出 provider 元信息（不含 API Key）。
 */
export declare function listStoredProviderMetas(context: PlatformStoreContext): StoredProviderMeta[];
/**
 * 获取单个 provider。
 */
export declare function getStoredProvider(context: PlatformStoreContext, providerId: string): Promise<StoredModelProvider | null>;
/**
 * 新增或更新 provider。
 */
export declare function upsertStoredProvider(context: PlatformStoreContext, input: UpsertModelProviderInput): Promise<void>;
/**
 * 删除 provider。
 */
export declare function removeStoredProvider(context: PlatformStoreContext, providerId: string): void;
/**
 * 列出 models。
 */
export declare function listStoredModels(context: PlatformStoreContext): StoredModel[];
/**
 * 获取单个 model。
 */
export declare function getStoredModel(context: PlatformStoreContext, modelId: string): StoredModel | null;
/**
 * 新增或更新 model。
 */
export declare function upsertStoredModel(context: PlatformStoreContext, input: UpsertModelInput): void;
/**
 * 切换 model 暂停状态。
 */
export declare function setStoredModelPaused(context: PlatformStoreContext, modelId: string, paused: boolean): void;
/**
 * 删除 model。
 */
export declare function removeStoredModel(context: PlatformStoreContext, modelId: string): void;
/**
 * 获取“model + provider”聚合信息。
 */
export declare function getResolvedStoredModel(context: PlatformStoreContext, modelId: string): Promise<{
    model: StoredModel;
    provider: StoredModelProvider;
} | null>;
/**
 * 清空模型相关表。
 */
export declare function clearStoredModelsAndProviders(context: PlatformStoreContext): void;
//# sourceMappingURL=StoreModelRepository.d.ts.map