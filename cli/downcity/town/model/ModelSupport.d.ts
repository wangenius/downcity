/**
 * `town model` 支撑工具。
 *
 * 关键点（中文）
 * - 只保留项目路径解析与 `execution.modelId` 绑定写入。
 * - Town 不发现 provider 模型，也不写入本地模型池。
 */
/**
 * 解析项目根目录。
 */
export declare function resolveProjectRoot(pathInput?: string): string;
/**
 * 设置项目 `downcity.json.execution.modelId`。
 *
 * 关键点（中文）
 * - 仅更新绑定字段，不触碰其他运行配置。
 * - 该操作用于把“City AIService 中的模型 ID”绑定到具体 agent 项目。
 */
export declare function setProjectPrimaryModel(projectRoot: string, modelId: string): {
    shipJsonPath: string;
    previousPrimary: string;
    nextPrimary: string;
};
//# sourceMappingURL=ModelSupport.d.ts.map