/**
 * `city plugin` 命令组辅助函数。
 *
 * 关键点（中文）
 * - `city plugin` 提供 Agent 内部 plugin 目录入口。
 * - `list/info` 不依赖 agent，只展示内建 plugin 定义事实。
 * - City 不承载 plugin 运行态；运行态归属于具体 agent。
 * - `action` 仍保留为高级入口，真正执行时依赖具体 agent 项目。
 */
import type { JsonValue, PluginCliBaseOptions } from "@downcity/agent";
type StaticCatalogEntry = {
    name: string;
    title: string;
    kind: "agent-runtime" | "action";
    actionCount: number;
    actions: string[];
    hasSystem: boolean;
    note?: string;
};
export declare function createPluginCatalog(): import("@downcity/agent").BasePlugin[];
export declare function createVisiblePluginCatalog(): import("@downcity/agent").BasePlugin[];
export declare function listVisiblePluginActions(pluginName: string, actions: string[]): string[];
export declare function resolvePluginProjectRoot(options: PluginCliBaseOptions): Promise<{
    projectRoot?: string;
    error?: string;
}>;
export declare function validatePluginProjectRoot(projectRoot: string): string | null;
export declare function parseCommandPayload(raw?: string): JsonValue | undefined;
export declare function stripAnsi(input: string): string;
export declare function truncateCell(input: string, width: number): string;
export declare function renderPluginCatalogTable(rows: Array<{
    name: string;
    title: string;
    kind: "agent-runtime" | "action";
    actionCount: number;
    hasSystem: boolean;
}>): void;
export declare function listStaticCatalogEntries(): StaticCatalogEntry[];
export declare function findStaticCatalogEntry(pluginName: string): StaticCatalogEntry | null;
type plugin_manager_selection = {
    /** 选择类型：进入 Chat 共享资源管理器。 */
    type: "chat";
} | {
    /** 选择类型：查看某个 Plugin。 */
    type: "plugin";
    /** 目标 Plugin 名称。 */
    plugin_name: string;
} | {
    /** 选择类型：退出 Plugin 管理器。 */
    type: "exit";
};
export declare function formatPluginDescription(plugin: StaticCatalogEntry): string;
export declare function promptPluginSelection(): Promise<plugin_manager_selection | null>;
export declare function promptPluginName(message: string): Promise<string | null>;
export declare function resolveInteractivePluginName(params: {
    pluginName?: string;
    message: string;
}): Promise<string | null>;
export declare function runPluginListCommand(options: {
    json?: boolean;
}): Promise<void>;
export declare function runPluginInfoCommand(params: {
    pluginName?: string;
    options: {
        json?: boolean;
    };
}): Promise<void>;
export {};
//# sourceMappingURL=PluginHelpers.d.ts.map