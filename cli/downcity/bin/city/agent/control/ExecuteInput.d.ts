/**
 * Control execute 输入拼装 helper。
 *
 * 关键点（中文）
 * - 负责把 API 传入的附件规范化并落盘。
 * - 最终统一转成 `<file>` 标签注入到 user message。
 */
import type { ControlSessionExecuteAttachmentInput } from "../../../city/agent/control/types/ControlSessionExecute.js";
/**
 * 构造 execute 入站文本。
 */
export declare function buildExecuteInputText(params: {
    projectRoot: string;
    sessionId: string;
    instructions: string;
    attachments?: ControlSessionExecuteAttachmentInput[];
}): Promise<string>;
//# sourceMappingURL=ExecuteInput.d.ts.map