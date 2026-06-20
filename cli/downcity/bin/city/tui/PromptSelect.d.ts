/**
 * City TUI 选择类 prompt 实现。
 *
 * 关键点（中文）
 * - 覆盖 select / multiselect / confirm 三种选择交互。
 * - 统一左侧 sidebar 展示选项，右侧主区域展示详情。
 */
import { type PromptObject } from "../../city/tui/Prompts.js";
/**
 * 运行单选 prompt。
 */
export declare function run_select_prompt(question: PromptObject): Promise<unknown>;
/**
 * 运行多选 prompt。
 */
export declare function run_multiselect_prompt(question: PromptObject): Promise<unknown[] | undefined>;
/**
 * 运行确认 prompt。
 */
export declare function run_confirm_prompt(question: PromptObject): Promise<boolean | undefined>;
//# sourceMappingURL=PromptSelect.d.ts.map