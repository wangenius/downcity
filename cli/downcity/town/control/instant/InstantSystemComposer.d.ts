/**
 * InstantSystemComposer：即时模式临时 session 的 system composer。
 *
 * 关键点（中文）
 * - 只负责把传入的静态 prompt 文本转为 system messages。
 * - 不依赖完整 AgentContext，避免为了即时模式拉起正式 runtime。
 * - 支持项目路径与 sessionId 变量替换，保留 PROFILE/SOUL 等静态提示的可用性。
 */
import type { SessionSystemComposer } from "@downcity/agent";
type InstantSystemComposerOptions = {
    /**
     * 当前要注入的静态 prompt 文本集合。
     */
    prompts: string[];
    /**
     * 可选项目根目录。
     *
     * 说明（中文）
     * - 用于替换 system prompt 里的项目路径变量。
     */
    projectRoot?: string;
};
/**
 * 即时模式 system composer 默认实现。
 */
export declare class InstantSystemComposer implements SessionSystemComposer {
    readonly name = "inline_instant_system";
    private readonly prompts;
    private readonly projectRoot;
    constructor(options: InstantSystemComposerOptions);
    resolve(): Promise<import("ai").SystemModelMessage[]>;
}
export {};
//# sourceMappingURL=InstantSystemComposer.d.ts.map