/**
 * City 侧 City AIService 绑定模块。
 *
 * 关键点（中文）
 * - City 不拥有模型池，也不解析 provider / apiKey / baseURL。
 * - 模型目录唯一来源是 City 的 AIService：`/v1/ai/models`。
 * - 运行时模型通过 City 自己保存的 User City session 构造。
 */
import type { AgentModel } from "@downcity/agent";
import type { CityModelDescriptor } from "@downcity/type";
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
 * 读取可供 City 绑定的 City AIService 模型选项。
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