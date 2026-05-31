/**
 * AgentHostRuntime：装配 AgentRuntime 宿主能力。
 *
 * 关键点（中文）
 * - `main/agent/*` 负责创建这些宿主能力对象，再注入到 AgentRuntime。
 * - plugin runtimes / session / plugins 只消费这些对象，不再直接 import `main/*`。
 * - 当前由 Town 在这里统一装配路径与 plugin 配置持久化两类宿主对象。
 */
import { getCacheDirPath, getDowncityChannelDirPath, getDowncityChannelMetaPath, getDowncityChatHistoryPath, getDowncityDirPath, getDowncityMemoryDailyDirPath, getDowncityMemoryDailyPath, getDowncityMemoryLongTermPath, getDowncitySessionDirPath, getDowncitySessionRootDirPath, } from "../../config/Paths.js";
import { persistProjectPluginConfig } from "@downcity/agent";
/**
 * 创建当前项目的路径能力集合。
 */
export function createAgentPathRuntime(projectRoot, agentIdInput) {
    const rootPath = String(projectRoot || "").trim();
    const agentId = String(agentIdInput || "").trim();
    return {
        projectRoot: rootPath,
        agentId,
        getDowncityDirPath: () => getDowncityDirPath(rootPath),
        getCacheDirPath: () => getCacheDirPath(rootPath),
        getDowncityChannelDirPath: () => getDowncityChannelDirPath(rootPath),
        getDowncityChannelMetaPath: () => getDowncityChannelMetaPath(rootPath),
        getDowncityChatHistoryPath: (sessionId) => getDowncityChatHistoryPath(rootPath, sessionId),
        getDowncityMemoryLongTermPath: () => getDowncityMemoryLongTermPath(rootPath),
        getDowncityMemoryDailyDirPath: () => getDowncityMemoryDailyDirPath(rootPath),
        getDowncityMemoryDailyPath: (date) => getDowncityMemoryDailyPath(rootPath, date),
        getDowncitySessionRootDirPath: () => getDowncitySessionRootDirPath(rootPath, agentId),
        getDowncitySessionDirPath: (sessionId) => getDowncitySessionDirPath(rootPath, agentId, sessionId),
    };
}
/**
 * 创建 plugin 配置持久化能力集合。
 */
export function createAgentPluginConfigRuntime(projectRoot) {
    const rootPath = String(projectRoot || "").trim();
    return {
        async persistProjectPlugins(plugins) {
            return persistProjectPluginConfig({
                projectRoot: rootPath,
                sections: {
                    ...(plugins !== undefined ? { plugins } : {}),
                },
            });
        },
    };
}
//# sourceMappingURL=AgentHostRuntime.js.map