/**
 * TownBuiltinPlugins：Town 宿主侧内建 plugin 装配。
 *
 * 关键点（中文）
 * - Town 运行期直接 new 每个 plugin，所有 constructor 参数都由 Town 宿主层注入。
 * - `@downcity/plugins` 只提供 plugin class，不参与 Town 全局账号、City 登录态或运行配置解析。
 * - 静态 CLI catalog 使用同一套 Town 装配入口，但不注入需要 City 登录态的 image/asr/tts。
 */
import type { BasePlugin } from "@downcity/agent/internal/plugin/core/BasePlugin.js";
/**
 * 创建不依赖 City 登录态的 Town 内建 plugin 集合。
 *
 * 关键点（中文）：该集合用于 CLI catalog 与 agent runtime 的公共基础部分，保持所有 plugin 都走 constructor。
 */
export declare function createTownStaticBuiltinPlugins(input?: {
    /**
     * 是否读取 Town 全局 chat accounts 并注入 chat channels。
     */
    includeChatAccounts?: boolean;
}): BasePlugin[];
/**
 * 创建 Town agent 运行期应启用的完整内建 plugin 集合。
 */
export declare function createTownBuiltinPlugins(input?: {
    /**
     * 宿主显式注入的 env，用于支持 DOWNCITY_CITY_* 覆盖项。
     */
    env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): Promise<BasePlugin[]>;
//# sourceMappingURL=TownBuiltinPlugins.d.ts.map