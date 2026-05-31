/**
 * ExecutionModelBinding：Town 宿主侧执行模型绑定辅助。
 *
 * 职责说明（中文）
 * - 统一承接平台模型池读取、模型候选列表构建与项目 execution.modelId 校验。
 * - 保证 `Agent` 只接收最终 `LanguageModel`，不再承担模型池查询职责。
 * - 让 CLI、control gateway、前台启动等宿主入口复用同一套模型绑定规则。
 */
/**
 * 平台模型下拉候选项。
 */
export interface PlatformModelChoice {
    /**
     * 下拉展示文案。
     */
    title: string;
    /**
     * 实际写入 `execution.modelId` 的模型 ID。
     */
    value: string;
}
/**
 * 读取平台模型候选列表。
 *
 * 关键点（中文）
 * - 输出结果面向 CLI/Console 的模型选择界面。
 * - provider 信息会拼到标题中，便于区分同名模型。
 */
export declare function listPlatformModelChoices(): Promise<PlatformModelChoice[]>;
/**
 * 断言指定平台模型可用于 agent execution。
 *
 * 关键点（中文）
 * - 当前只校验“存在且未暂停”。
 * - 供应商连通性与 API Key 可用性仍交给真正创建模型实例时再校验。
 */
export declare function assertPlatformModelReady(modelId: string): void;
/**
 * 断言项目 execution 绑定已声明且目标模型可用。
 *
 * 关键点（中文）
 * - 这里是 Town 启动/控制面入口的宿主前置校验。
 * - 失败时抛出稳定错误，交由 CLI 或 HTTP 层决定如何展示。
 */
export declare function assertProjectExecutionModelReady(projectRoot: string): void;
//# sourceMappingURL=ExecutionModelBinding.d.ts.map