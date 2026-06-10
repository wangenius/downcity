/**
 * TownBuiltinPlugins：Town 宿主侧内建 plugin 装配。
 *
 * 关键点（中文）
 * - `@downcity/plugins` 只定义内建 plugin 与工厂，不直接读取 Town 登录态。
 * - Town 在这里把当前 City user 的 AI 能力注入给 image / asr / tts plugin。
 * - 静态 CLI catalog 仍可直接使用 `createBuiltinPlugins()`，避免 help/list 依赖 City 登录。
 */
import type { BasePlugin } from "@downcity/agent/internal/plugin/core/BasePlugin.js";
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