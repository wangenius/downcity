/**
 * InstantSystemComposer：即时模式临时 session 的 system composer。
 *
 * 关键点（中文）
 * - 只负责把传入的静态 prompt 文本转为 system messages。
 * - 不依赖完整 AgentContext，避免为了即时模式拉起正式 runtime。
 * - 支持项目路径与 sessionId 变量替换，保留 PROFILE/SOUL 等静态提示的可用性。
 */
import { getSessionRunScope, transformPromptsIntoSystemMessages, } from "@downcity/agent";
/**
 * 即时模式 system composer 默认实现。
 */
export class InstantSystemComposer {
    name = "inline_instant_system";
    prompts;
    projectRoot;
    constructor(options) {
        this.prompts = Array.isArray(options.prompts)
            ? options.prompts
                .map((item) => String(item || "").trim())
                .filter(Boolean)
            : [];
        this.projectRoot = String(options.projectRoot || "").trim();
    }
    async resolve() {
        if (this.prompts.length < 1)
            return [];
        const scope = getSessionRunScope();
        return await transformPromptsIntoSystemMessages(this.prompts, {
            ...(this.projectRoot ? { projectPath: this.projectRoot } : {}),
            ...(String(scope?.sessionId || "").trim()
                ? { sessionId: String(scope?.sessionId || "").trim() }
                : {}),
        });
    }
}
//# sourceMappingURL=InstantSystemComposer.js.map