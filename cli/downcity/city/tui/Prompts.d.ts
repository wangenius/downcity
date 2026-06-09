/**
 * City 交互式 TUI prompt 适配层。
 *
 * 关键点（中文）
 * - 用全屏 TUI 替换 `@clack/prompts` 常用能力。
 * - 先覆盖当前 City CLI 实际使用到的 `select / text / password / confirm`。
 * - 选择类问题统一在左侧 sidebar，右侧 main_section 只展示详情或输入。
 * - 保持返回约定尽量接近 clack，便于渐进替换现有流程。
 */
interface prompt_select_option {
    label: string;
    value: unknown;
    hint?: string;
}
interface prompt_select_input {
    message: string;
    options: prompt_select_option[];
}
interface prompt_text_input {
    message: string;
    initialValue?: string;
    placeholder?: string;
    validate?: (value: string) => string | true | undefined;
}
interface prompt_confirm_input {
    message: string;
    initialValue?: boolean;
}
/**
 * clack 兼容：select。
 */
export declare function select(input: prompt_select_input): Promise<unknown>;
/**
 * clack 兼容：text。
 */
export declare function text(input: prompt_text_input): Promise<unknown>;
/**
 * clack 兼容：password。
 */
export declare function password(input: prompt_text_input): Promise<unknown>;
/**
 * clack 兼容：confirm。
 */
export declare function confirm(input: prompt_confirm_input): Promise<unknown>;
/**
 * clack 兼容：isCancel。
 */
export declare function isCancel(value: unknown): boolean;
/**
 * clack 兼容：intro。
 */
export declare function intro(_message: string): void;
/**
 * clack 兼容：log。
 */
export declare const log: {
    info(message: string): void;
    error(message: string): void;
    success(message: string): void;
};
export {};
//# sourceMappingURL=Prompts.d.ts.map