/**
 * TownRegistry：town 后台维护的 agent registry（`~/.downcity/main/agents.json`）。
 *
 * 关键点（中文）
 * - registry 只维护“Town 认知到的 agent 项目列表”，用于统一观测与批量管理。
 * - registry 不承载实时健康检查：status/list 会读取每个项目的 daemon pid 并判活。
 * - agent daemon 启动成功后必须登记到 town 后台（强约束）。
 */
import type { ManagedAgentRegistryEntry, ManagedAgentRegistryV1 } from "@downcity/agent";
/**
 * 确保 town agent registry 文件存在。
 *
 * 关键点（中文）
 * - 空 Town 运行态也应拥有显式的空 registry，避免管理侧将“尚未启动任何 agent”误判为异常。
 * - 若文件已存在则不覆盖，保持历史记录不丢失。
 */
export declare function ensureManagedAgentRegistry(): Promise<void>;
/**
 * 获取 town agent registry 文件路径。
 */
export declare function getManagedAgentsRegistryPath(): string;
/**
 * 读取 town agent registry（容错）。
 *
 * 关键点（中文）
 * - 文件不存在或损坏时返回空 registry，避免影响主流程。
 */
export declare function readManagedAgentRegistry(): Promise<ManagedAgentRegistryV1>;
/**
 * 列出 Town registry 中记录的 agent（按 projectRoot 排序）。
 */
export declare function listManagedAgentEntries(): Promise<ManagedAgentRegistryEntry[]>;
/**
 * 新增或更新一条 town agent 记录。
 */
export declare function upsertManagedAgentEntry(input: {
    projectRoot: string;
    pid: number;
    startedAt?: string;
    status?: "running" | "stopped";
    stoppedAt?: string;
}): Promise<void>;
/**
 * 标记 agent 为 stopped（保留历史记录，不删除）。
 */
export declare function markManagedAgentStopped(projectRoot: string): Promise<void>;
/**
 * 按 projectRoot 移除一条 agent 记录。
 */
export declare function removeManagedAgentEntry(projectRoot: string): Promise<void>;
//# sourceMappingURL=TownRegistry.d.ts.map