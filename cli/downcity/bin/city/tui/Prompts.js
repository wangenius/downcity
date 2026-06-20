/**
 * City 交互式 TUI prompt 适配层。
 *
 * 关键点（中文）
 * - 用全屏 TUI 替换 `prompts` 的交互行为，但尽量保持返回结构兼容。
 * - 本模块暴露类型、入口与公共 shell；具体 select / multiselect / confirm 在 PromptSelect.ts，
 *   text / number / password 在 PromptInput.ts。
 */
import blessed from "neo-blessed";
import { t } from "../../shared/CliLocale.js";
import { run_confirm_prompt, run_multiselect_prompt, run_select_prompt, } from "../../city/tui/PromptSelect.js";
import { run_number_prompt, run_text_prompt } from "../../city/tui/PromptInput.js";
/**
 * City 使用的 prompts 默认导出。
 */
export default async function prompts(input) {
    const questions = Array.isArray(input) ? input : [input];
    const answers = {};
    for (const question of questions) {
        const value = await run_prompt_question(question);
        if (value === undefined) {
            return answers;
        }
        answers[question.name] = value;
    }
    return answers;
}
async function run_prompt_question(question) {
    if (question.type === "select") {
        return await run_select_prompt(question);
    }
    if (question.type === "multiselect") {
        return await run_multiselect_prompt(question);
    }
    if (question.type === "confirm") {
        return await run_confirm_prompt(question);
    }
    if (question.type === "password") {
        return await run_text_prompt(question, { secret: true });
    }
    if (question.type === "number") {
        return await run_number_prompt(question);
    }
    return await run_text_prompt(question, { secret: false });
}
/**
 * 创建 prompt 全屏 shell。
 */
export function create_prompt_shell(title) {
    const screen = blessed.screen({
        smartCSR: true,
        fullUnicode: true,
        title,
        dockBorders: true,
        autoPadding: true,
    });
    screen.style = {
        bg: "black",
        fg: "white",
    };
    const sidebar_box = blessed.box({
        parent: screen,
        top: 0,
        left: 0,
        width: "34%",
        height: "100%-3",
        border: "line",
        label: ` ${t({ zh: "侧边栏", en: "Sidebar" })} `,
        style: {
            border: { fg: "green" },
        },
    });
    blessed.box({
        parent: sidebar_box,
        top: 0,
        left: 1,
        width: "100%-2",
        height: 2,
        content: format_breadcrumb(title),
        style: {
            fg: "green",
            bold: true,
        },
    });
    const main_box = blessed.box({
        parent: screen,
        top: 0,
        left: "34%",
        width: "66%",
        height: "100%-3",
        border: "line",
        label: ` ${t({ zh: "主区域", en: "Main" })} `,
        style: {
            border: { fg: "green" },
        },
    });
    const footer_box = blessed.box({
        parent: screen,
        left: 0,
        bottom: 0,
        width: "100%",
        height: 3,
        border: "line",
        padding: { left: 1, top: 1 },
        style: {
            border: { fg: "green" },
            fg: "gray",
        },
        content: "",
    });
    return {
        screen,
        sidebar_box,
        main_box,
        footer_box,
    };
}
/**
 * 构建列表样式。
 */
export function build_list_style() {
    return {
        border: { fg: "green" },
        item: { fg: "white" },
        selected: {
            fg: "black",
            bg: "green",
            bold: true,
        },
    };
}
/**
 * 判断是否为纯 Esc 输入。
 */
export function is_plain_escape_input(text) {
    return text === "\u001b";
}
function format_breadcrumb(value) {
    return value.padEnd(80, " ");
}
//# sourceMappingURL=Prompts.js.map