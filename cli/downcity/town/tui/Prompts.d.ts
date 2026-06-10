/**
 * Town 交互式 TUI prompt 适配层。
 *
 * 关键点（中文）
 * - 用全屏 TUI 替换 `prompts` 的交互行为，但尽量保持返回结构兼容。
 * - 先覆盖当前仓库里实际使用到的 `select / multiselect / text / password / confirm / number`。
 * - 选择类问题统一在左侧 sidebar 交互，右侧 main_section 只展示详情或输入。
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
    choices?: prompt_choice_option[];
    /** 初始值。 */
    initial?: unknown;
    /** 输入校验。 */
    validate?: (value: any) => true | string;
    /** 最小值。 */
    min?: number;
}
/**
 * 选择类 Prompt 的单个选项。
 */
export interface prompt_choice_option {
    /** 左侧 sidebar 展示标题。 */
    title?: string;
    /** 兼容旧调用方的展示标签。 */
    label?: string;
    /** 当前选项聚焦时展示在 main/footer 的说明。 */
    description?: string;
    /** 兼容旧调用方的说明文本。 */
    hint?: string;
    /** 选中后返回给调用方的业务值。 */
    value?: unknown;
    /**
     * 是否仅作为分区标题展示。
     *
     * 关键点（中文）
     * - true 时该项只负责分隔 sidebar，不参与选择与多选勾选。
     * - TUI 会自动跳过该项，避免 Enter 返回无意义值。
     */
    disabled?: boolean;
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