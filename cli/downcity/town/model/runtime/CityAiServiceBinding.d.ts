/**
 * Town 侧 City AIService 绑定模块。
 *
 * 关键点（中文）
 * - Town 不拥有模型池，也不解析 provider / apiKey / baseURL。
 * - 模型目录唯一来源是 City 的 AIService：`/v1/ai/models`。
 * - 运行时模型通过 User City 构造，交给 @downcity/agent 的 CityModel 适配层执行。
 */
import type { AgentModel } from "@downcity/agent";
import type { CityModelDescriptor } from "@downcity/type";
/**
 * Town 可用于连接 City AIService 的配置。
 */
export interface TownCityAiServiceConfig {
    /**
     * City HTTP 服务地址。
     */
    city_url: string;
    /**
     * 当前 Agent 调用 AIService 时使用的 town_id。
     */
    town_id: string;
    /**
     * User City 调用凭证。
     */
    user_token: string;
    /**
     * 可选 admin key，仅用于列出 admin 视角的模型目录。
     */
    admin_secret_key?: string;
}
/**
 * City AIService 模型选项。
 */
export interface CityAiModelChoice {
    /**
     * CLI 选择器展示文案。
     */
    title: string;
    /**
     * 写入 `downcity.json.execution.modelId` 的模型 ID。
     */
    value: string;
    /**
     * 原始 City 模型目录项。
     */
    model: CityModelDescriptor;
}
/**
 * 读取 Town 连接 City AIService 所需配置。
 *
 * 关键点（中文）
 * - 优先使用环境变量，便于 daemon / CI 显式注入。
 * - 其次复用 city CLI 的 `~/.downcity/config.json`，避免 Town 再维护一套 server 配置。
 */
export declare function readTownCityAiServiceConfig(env?: NodeJS.ProcessEnv, options?: {
    /**
     * 是否要求 user_token 存在。
     */
    requireUserToken?: boolean;
}): TownCityAiServiceConfig;
/**
 * 读取管理端模型目录。
 */
export declare function listCityAiServiceModelsForAdmin(env?: NodeJS.ProcessEnv): Promise<CityModelDescriptor[]>;
/**
 * 读取用户态可调用模型目录。
 */
export declare function listCityAiServiceModelsForUser(env?: NodeJS.ProcessEnv): Promise<CityModelDescriptor[]>;
/**
 * 构建 City AIService 模型选择项。
 */
export declare function toCityAiModelChoices(models: CityModelDescriptor[]): CityAiModelChoice[];
/**
 * 读取可供 Town 绑定的 City AIService 模型选项。
 */
export declare function listCityAiModelChoices(env?: NodeJS.ProcessEnv): Promise<CityAiModelChoice[]>;
/**
 * 断言 City AIService 暴露了指定 model。
 */
export declare function assertCityAiModelReady(modelId: string, env?: NodeJS.ProcessEnv): Promise<void>;
/**
 * 创建 Agent 可直接使用的 City 模型。
 */
export declare function createCityAiAgentModel(input: {
    /**
     * 目标 City AIService model id。
     */
    modelId: string;
    /**
     * 宿主环境变量。
     */
    env?: NodeJS.ProcessEnv;
}): Promise<AgentModel>;
//# sourceMappingURL=CityAiServiceBinding.d.ts.map