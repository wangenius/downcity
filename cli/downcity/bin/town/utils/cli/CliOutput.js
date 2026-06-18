/**
 * CLI 输出工具（统一出口）。
 *
 * 关键点（中文）
 * - 所有命令通过 printResult 输出，不再直接调用 emitCliBlock / emitCliList / console.log。
 * - asJson=true → 结构化 JSON（脚本友好）；asJson=false → 委托 CliReporter 渲染人类可读文本。
 * - 支持三种输出类型：block（单段落）、list（列表分组）、payload（旧版键值对，兼容过渡）。
 */
import { emitCliBlock, emitCliList, } from "../../../shared/CliReporter.js";
/**
 * 判断值是否为 plain object。
 */
function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
/**
 * 将 payload 转换为 facts 列表（用于人类可读渲染）。
 */
function payloadToFacts(payload) {
    const entries = Object.entries(payload).filter(([key, value]) => key !== "success" && value !== undefined);
    // error 置底，其余按字母序
    const ordered = [...entries].sort((a, b) => {
        if (a[0] === "error")
            return 1;
        if (b[0] === "error")
            return -1;
        return a[0].localeCompare(b[0]);
    });
    return ordered.map(([key, value]) => {
        if (value === null || value === undefined) {
            return { label: key, value: "null" };
        }
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            return { label: key, value: String(value) };
        }
        return { label: key, value: JSON.stringify(value) };
    });
}
/**
 * 将 payload 展平为 JSON-safe 对象。
 */
function payloadToJson(payload) {
    const result = {};
    for (const [key, value] of Object.entries(payload)) {
        if (key === "success")
            continue;
        if (value === undefined)
            continue;
        result[key] = value;
    }
    return result;
}
/**
 * 统一 CLI 输出入口。
 *
 * 行为（中文）
 * - asJson=true：输出 `{ success, data?: {...}, error?: string }` 到 stdout。
 * - asJson=false：
 *   - type="block" → emitCliBlock
 *   - type="list" → emitCliList
 *   - 未传 type → 将 payload 转为 facts 后 emitCliBlock
 */
export function printResult(params) {
    const asJson = params.asJson !== false;
    if (asJson) {
        const output = { success: params.success };
        if (params.type === "block") {
            output.title = params.title;
            if (params.summary)
                output.summary = params.summary;
            if (params.facts && params.facts.length > 0)
                output.facts = params.facts;
            if (params.note)
                output.note = params.note;
        }
        else if (params.type === "list") {
            output.title = params.title;
            if (params.summary)
                output.summary = params.summary;
            if (params.items && params.items.length > 0)
                output.items = params.items;
        }
        else if (params.payload) {
            Object.assign(output, payloadToJson(params.payload));
        }
        console.log(JSON.stringify(output, null, 2));
        return;
    }
    // --- 人类可读模式 ---
    if (params.type === "block") {
        emitCliBlock({
            tone: params.tone || (params.success ? "success" : "error"),
            title: params.title,
            summary: params.summary,
            facts: params.facts,
            note: params.note,
        });
        return;
    }
    if (params.type === "list") {
        emitCliList({
            tone: params.tone || "accent",
            title: params.title,
            summary: params.summary,
            items: params.items || [],
        });
        return;
    }
    // --- payload 兼容模式 ---
    const facts = payloadToFacts(params.payload || {});
    emitCliBlock({
        tone: params.tone || (params.success ? "success" : "error"),
        title: params.title,
        facts,
    });
}
//# sourceMappingURL=CliOutput.js.map