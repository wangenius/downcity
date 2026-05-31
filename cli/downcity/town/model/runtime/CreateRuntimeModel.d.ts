/**
 * CreateRuntimeModel：Town 宿主侧 LanguageModel 工厂。
 *
 * 关键点（中文）
 * - `@downcity/agent` 只消费 `LanguageModel`，不再负责模型池解析。
 * - Town 负责把 `execution.modelId` 解析成平台模型池中的 provider/model 配置。
 * - 这里统一承接 CLI、control plane、inline instant 等宿主场景的模型创建逻辑。
 */
import type { LanguageModel } from "ai";
import { type DowncityConfig } from "@downcity/agent";
type ModelLogContext = {
    /**
     * 当前 session 标识，用于 LLM 请求日志追踪。
     */
    sessionId?: string;
};
type RuntimeModelFactoryInput = {
    /**
     * 当前项目配置。
     *
     * 关键点（中文）
     * - 这里只依赖 `execution.modelId` 与 `llm.logMessages`。
     * - provider/model 详情统一从平台模型池读取。
     */
    config: DowncityConfig;
    /**
     * 可选 session run scope。
     *
     * 关键点（中文）
     * - 仅用于把 sessionId 透传到 LLM 请求日志元数据。
     */
    getSessionRunScope?: () => ModelLogContext | undefined;
    /**
     * 宿主显式注入的运行时 env。
     *
     * 关键点（中文）
     * - 这里只作为 provider apiKey 的回退来源。
     * - 不再从 `downcity.json` 或 provider 配置里解析 `${ENV_KEY}` 占位符。
     */
    env?: Record<string, string> | NodeJS.ProcessEnv;
};
/**
 * 创建 LanguageModel 实例。
 *
 * 解析策略（中文）
 * 1) 读取 `execution.modelId`。
 * 2) 从 Town 平台模型池解析 provider/model。
 * 3) 按 provider type 分发到对应 AI SDK 工厂。
 */
export declare function createRuntimeModel(input: RuntimeModelFactoryInput): Promise<LanguageModel>;
export {};
//# sourceMappingURL=CreateRuntimeModel.d.ts.map