/**
 * `town model` 命令共享工具。
 *
 * 关键点（中文）
 * - 统一封装 provider / model 子命令共用的解析、脱敏、错误输出逻辑。
 * - 保持 `Model.ts` 只负责命令装配，不再承载具体业务实现。
 */
import { printResult } from "../utils/cli/CliOutput.js";
import { ModelPresetManager, } from "../model/preset/ModelPresetManager.js";
import { PlatformStore } from "../platform/store/index.js";
const SUPPORTED_PROVIDER_TYPES = [
    "anthropic",
    "openai",
    "deepseek",
    "gemini",
    "open-compatible",
    "open-responses",
    "moonshot-cn",
    "moonshot-ai",
    "kimi-code",
    "xai",
    "huggingface",
    "openrouter",
];
const modelManager = new ModelPresetManager();
function maskSecret(value) {
    const raw = String(value || "").trim();
    if (!raw)
        return undefined;
    if (raw.length <= 8)
        return "***";
    return `${raw.slice(0, 4)}***${raw.slice(-4)}`;
}
export function toSafeProviderView(provider) {
    const masked = maskSecret(provider.apiKey);
    return {
        ...provider,
        apiKey: masked ? "***masked***" : undefined,
        apiKeyMasked: masked,
    };
}
export { parseBoolean as parseBooleanOption } from "../shared/IndexSupport.js";
export function parseNumberOption(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || Number.isNaN(num)) {
        throw new Error(`Invalid number: ${value}`);
    }
    return num;
}
export function parsePositiveIntegerOption(value) {
    const num = Number.parseInt(value, 10);
    if (!Number.isFinite(num) || Number.isNaN(num) || !Number.isInteger(num) || num <= 0) {
        throw new Error(`Invalid positive integer: ${value}`);
    }
    return num;
}
export function assertProviderType(inputType) {
    const candidate = String(inputType || "").trim();
    if (!SUPPORTED_PROVIDER_TYPES.includes(candidate)) {
        throw new Error(`Unsupported provider type: ${inputType}. Supported: ${SUPPORTED_PROVIDER_TYPES.join(", ")}`);
    }
    return candidate;
}
export function getSupportedProviderTypes() {
    return SUPPORTED_PROVIDER_TYPES;
}
export function resolveModelPresetOrThrow(input) {
    const presetId = String(input || "").trim();
    if (!presetId)
        return undefined;
    const preset = modelManager.getPreset(presetId);
    if (!preset)
        throw new Error(`Unknown model preset: ${presetId}`);
    return preset;
}
export async function runStoreCommand(options, handler) {
    const asJson = options.json !== false;
    let store = null;
    try {
        store = new PlatformStore();
        const result = await handler(store);
        printResult({
            asJson,
            success: true,
            title: result.title,
            payload: result.payload,
        });
    }
    catch (error) {
        printResult({
            asJson,
            success: false,
            title: "platform model command failed",
            payload: {
                error: error instanceof Error &&
                    String(error.message || "").includes("unable to open database file")
                    ? 'Platform model store is unavailable. Run "town init" first.'
                    : error instanceof Error
                        ? error.message
                        : String(error),
            },
        });
        process.exitCode = 1;
    }
    finally {
        store?.close();
    }
}
//# sourceMappingURL=ModelCommandShared.js.map