/**
 * Sandbox 共享类型定义。
 *
 * 关键点（中文）
 * - 这里放的是 console 模块与 agent 执行层都会使用的最小 sandbox 协议。
 * - 当前版本不引入复杂 profile / binding / permission 模型，只表达“命令执行边界”。
 * - 运行时句柄与状态化 session 类型放在 `src/types/sandbox/`。
 */

/**
 * Sandbox 网络模式。
 *
 * 说明（中文）
 * - `off`：完全禁止网络访问。
 * - `restricted`：允许受限网络访问（后续实现白名单时再细化）。
 * - `full`：允许完整网络访问。
 */
export type SandboxNetworkMode = "off" | "restricted" | "full";

/**
 * Sandbox 路径访问模式。
 *
 * 说明（中文）
 * - `ro`：只读。
 * - `rw`：可读写。
 */
export type SandboxPathAccessMode = "ro" | "rw";

/**
 * 单条路径边界规则。
 */
export interface SandboxPathRule {
  /**
   * 宿主机上的绝对路径。
   */
  path: string;

  /**
   * 当前路径在 sandbox 中的访问模式。
   */
  access: SandboxPathAccessMode;

  /**
   * 当前规则的说明文本。
   */
  reason?: string;
}

/**
 * sandbox 最小配置。
 *
 * 说明（中文）
 * - 当前只表达命令执行边界，不表达 chat 用户授权与审批流。
 * - `rootPath` 是默认工作根目录。
 * - `writablePaths` 决定哪些路径允许写入。
 * - `envAllowlist` 决定哪些环境变量允许导出到 sandbox。
 */
export interface SandboxConfig {
  /**
   * 当前 sandbox 的默认根目录。
   */
  rootPath: string;

  /**
   * 允许导出的环境变量名集合。
   *
   * 说明（中文）
   * - 这里仅声明允许导出的 key，不在共享配置层直接保存明文值。
   */
  envAllowlist: string[];

  /**
   * 允许写入的路径集合。
   *
   * 说明（中文）
   * - 路径可以是绝对路径，也可以是相对 `rootPath` 的相对路径。
   * - 运行时会统一解析为绝对路径，并限制在 `rootPath` 范围内。
   */
  writablePaths: string[];

  /**
   * 当前 sandbox 的网络模式。
   */
  networkMode: SandboxNetworkMode;
}

/**
 * 项目级 sandbox 配置。
 *
 * 说明（中文）
 * - 这是 `downcity.json` 中面向用户暴露的最小配置。
 * - 当前版本只服务 CLI / shell 执行边界，不扩展到审批或用户权限系统。
 */
export interface SandboxProjectConfig {
  /**
   * 允许导出的环境变量名集合。
   *
   * 说明（中文）
   * - 这里只声明允许导出的 key，不直接保存变量值。
   * - 运行时仍会注入少量必需变量，例如隔离后的 `HOME`、`TMPDIR`。
   */
  envAllowlist?: string[];

  /**
   * 允许写入的路径集合。
   *
   * 说明（中文）
   * - 路径可以是绝对路径，也可以是相对 `rootPath` 的相对路径。
   * - 当前版本会把越出 `rootPath` 的路径裁掉，避免把宿主文件系统重新暴露回去。
   */
  writablePaths?: string[];

  /**
   * 当前 sandbox 的网络模式。
   *
   * 说明（中文）
   * - 默认建议使用 `off`。
   * - `restricted` 先保留为受限网络语义占位，当前实现会按保守策略处理。
   */
  networkMode?: SandboxNetworkMode;
}

/**
 * console 模块中保存的 agent sandbox 配置记录。
 */
export interface AgentSandboxConfigRecord {
  /**
   * 当前 agent 的稳定标识。
   *
   * 说明（中文）
   * - 当前建议直接使用 agent 项目根目录绝对路径。
   */
  agentId: string;

  /**
   * 当前 agent 使用的 sandbox 配置。
   */
  config: SandboxConfig;

  /**
   * 最近更新时间（ISO8601）。
   */
  updatedAt: string;
}
