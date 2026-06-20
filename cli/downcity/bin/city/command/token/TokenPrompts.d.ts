/**
 * Token 命令交互式提示流程。
 *
 * 关键点（中文）
 * - 封装所有需要 prompts 的交互式入口。
 * - 与动作、渲染模块解耦，只负责引导用户输入。
 */
export declare function promptTokenIdForDelete(): Promise<string | null>;
export declare function runInteractiveCreateCommandFlow(options: {
    expiresAt?: string;
}): Promise<void>;
export declare function runInteractiveTokenCommand(): Promise<void>;
//# sourceMappingURL=TokenPrompts.d.ts.map