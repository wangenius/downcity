/**
 * City TUI 输入类 prompt 实现。
 *
 * 关键点（中文）
 * - 覆盖 text / password / number 三种输入交互。
 * - 负责文本框创建、校验与 footer 提示。
 */
import { type PromptObject } from "./Prompts.js";
/**
 * 运行文本输入 prompt（含 password）。
 */
export declare function run_text_prompt(question: PromptObject, options: {
    secret: boolean;
}): Promise<string | undefined>;
/**
 * 运行数字输入 prompt。
 */
export declare function run_number_prompt(question: PromptObject): Promise<number | undefined>;
//# sourceMappingURL=PromptInput.d.ts.map