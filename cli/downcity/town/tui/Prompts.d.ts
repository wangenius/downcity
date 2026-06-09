/**
 * Town 交互式 TUI prompt 适配层。
 *
 * 关键点（中文）
 * - 用全屏 TUI 替换 `prompts` 的交互行为，但尽量保持返回结构兼容。
 * - 先覆盖当前仓库里实际使用到的 `select / multiselect / text / password / confirm / number`。
 * - 脚本模式仍由调用方自己兜底；这里默认只服务交互式 TTY 场景。
 */
/**
 * 单个问题的最小兼容类型。
 */
export interface PromptObject {
    /** 问题类型。 */
    type: "select" | "multiselect" | "text" | "password" | "confirm" | "number";
    /** 结果字段名。 */
    name: string;
    /** 问题标题。 */
    message: string;
    /** 选项列表。 */
    choices?: Array<{
        title?: string;
        label?: string;
        description?: string;
        hint?: string;
        value: unknown;
    }>;
    /** 初始值。 */
    initial?: unknown;
    /** 输入校验。 */
    validate?: (value: any) => true | string;
    /** 最小值。 */
    min?: number;
}
interface prompt_result_map {
    [key: string]: unknown;
}
/**
 * Town 使用的 prompts 默认导出。
 */
export default function prompts(input: PromptObject | PromptObject[]): Promise<prompt_result_map>;
export {};
//# sourceMappingURL=Prompts.d.ts.map