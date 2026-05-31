/**
 * TownPaths：Town 全局运行态与 control plane 共享的路径规则。
 *
 * 关键点（中文）
 * - Downcity 的全局根目录固定在用户目录 `~/.downcity/`。
 * - `~/.downcity/downcity.db`：全局 SQLite 数据库，保存模型池与平台级配置。
 * - `~/.downcity/main/*`：town 后台与 control plane 共享的运行文件目录。
 * - 这里定义的是“全局路径约定”，不是单个 agent 项目的 `.downcity/` 路径。
 */
/**
 * 全局根目录（用户级）。
 *
 * 关键点（中文）
 * - 测试或多实例隔离场景可通过 `DC_PLATFORM_ROOT` 显式覆盖。
 */
export declare function getPlatformRootDirPath(): string;
/**
 * 全局 SQLite 数据库路径（用户级）。
 */
export declare function getPlatformStoreDbPath(): string;
/**
 * Town 全局运行目录（pid/log/registry）。
 */
export declare function getTownRuntimeDirPath(): string;
/**
 * 全局模型存储密钥文件路径。
 */
export declare function getPlatformStoreKeyPath(): string;
/**
 * town 后台 pid 文件路径。
 */
export declare function getTownPidPath(): string;
/**
 * town 后台日志路径（stdout/stderr 合并）。
 */
export declare function getTownLogPath(): string;
/**
 * control plane pid 文件路径。
 */
export declare function getControlPlanePidPath(): string;
/**
 * control plane 日志路径（stdout/stderr 合并）。
 */
export declare function getControlPlaneLogPath(): string;
/**
 * control plane 元数据路径。
 */
export declare function getControlPlaneMetaPath(): string;
/**
 * 受管 agent registry 文件路径（Town 维护的 agent 清单）。
 */
export declare function getManagedAgentRegistryPath(): string;
//# sourceMappingURL=TownPaths.d.ts.map