/**
 * `town chat auth` CLI 辅助模块。
 *
 * 关键点（中文）
 * - chat authorization 现在按 agent projectRoot 隔离存储。
 * - 授权主体使用 `<platform>:<platformUserId>`，例如 `telegram:12345678`。
 * - 管理员执行 `town chat auth set telegram:12345678` 后交互式选择 role。
 */
import type { Command } from "commander";
type ChatAuthSetOptions = {
    /**
     * 非交互式直接指定 roleId。
     */
    role?: string;
    /**
     * 目标 agent 项目根目录。
     */
    path?: string;
    /**
     * 是否以 JSON 输出。
     */
    json?: boolean;
};
/**
 * 设置授权主体角色。
 */
export declare function runChatAuthSet(params: {
    principal: string;
    options?: ChatAuthSetOptions;
}): Promise<void>;
/**
 * 交互式输入授权主体并设置角色。
 */
export declare function runInteractiveChatAuthSetFlow(options?: ChatAuthSetOptions): Promise<void>;
/**
 * 注册 `town chat auth` 命令。
 */
export declare function registerChatAuthCommands(chat: Command): void;
export {};
//# sourceMappingURL=ChatAuth.d.ts.map