/**
 * ExecutionModelBinding：City 宿主侧 City AIService 模型绑定辅助。
 *
 * 职责说明（中文）
 * - 统一读取 City AIService 模型目录。
 * - 校验项目 `execution.modelId` 是否能在 City AIService 中找到。
 * - City 只保存 model id，不保存 provider、key 或 endpoint。
 */
import { type CityAiModelChoice } from "./CityAiServiceBinding.js";
/**
 * City AIService 模型下拉候选项。
 */
export type PlatformModelChoice = CityAiModelChoice;
/**
 * 读取 City AIService 模型候选列表。
 */
export declare function listPlatformModelChoices(): Promise<PlatformModelChoice[]>;
/**
 * 断言指定模型可用于 agent execution。
 */
export declare function assertPlatformModelReady(modelId: string): Promise<void>;
/**
 * 断言项目 execution 绑定已声明且目标模型可用。
 */
export declare function assertProjectExecutionModelReady(projectRoot: string): Promise<void>;
//# sourceMappingURL=ExecutionModelBinding.d.ts.map