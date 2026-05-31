/**
 * `town model` 命令共享工具。
 *
 * 关键点（中文）
 * - 统一封装 provider / model 子命令共用的解析、脱敏、错误输出逻辑。
 * - 保持 `Model.ts` 只负责命令装配，不再承载具体业务实现。
 */
import { type ModelPreset } from "../model/preset/ModelPresetManager.js";
import type { LlmProviderType } from "@downcity/agent";
import { PlatformStore } from "../platform/store/index.js";
export declare function toSafeProviderView<T extends {
    apiKey?: string;
}>(provider: T): T & {
    apiKeyMasked?: string;
};
export { parseBoolean as parseBooleanOption } from "../shared/IndexSupport.js";
export declare function parseNumberOption(value: string): number;
export declare function parsePositiveIntegerOption(value: string): number;
export declare function assertProviderType(inputType: string): LlmProviderType;
export declare function getSupportedProviderTypes(): readonly LlmProviderType[];
export declare function resolveModelPresetOrThrow(input?: string): ModelPreset | undefined;
export declare function runStoreCommand(options: {
    json?: boolean;
}, handler: (store: PlatformStore) => Promise<{
    title: string;
    payload: Record<string, unknown>;
}>): Promise<void>;
//# sourceMappingURL=ModelCommandShared.d.ts.map