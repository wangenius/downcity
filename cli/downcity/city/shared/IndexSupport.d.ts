/**
 * CLI 入口共享工具。
 *
 * 关键点（中文）
 * - 统一承载 `Index.ts`、console 命令、agent 命令共用的参数解析与上下文注入逻辑。
 * - 保持共享工具纯函数化，避免命令装配文件继续膨胀。
 */
/**
 * 在关键运行命令执行前打印当前终端命令版本。
 *
 * 说明（中文）
 * - 仅用于 runtime 相关命令，避免影响 `config --json` 等结构化输出。
 * - 全局 catch CliError，统一渲染错误输出。
 */
export declare function createVersionBanner<TArgs extends unknown[]>(version: string, action: (...args: TArgs) => Promise<void> | void, command_name?: string): (...args: TArgs) => Promise<void>;
/**
 * 解析端口参数。
 */
export declare function parsePort(value: string): number;
/**
 * 解析布尔参数。
 */
export declare function parseBoolean(value: string | undefined): boolean;
/**
 * 异步睡眠工具。
 */
export declare const sleep: (ms: number) => Promise<void>;
/**
 * 从项目根目录推断 agent id。
 */
export declare function resolveAgentId(projectRoot: string): string;
/**
 * 注入当前 agent 执行上下文。
 */
export declare function injectAgentContext(pathInput?: string): {
    projectRoot: string;
    agentId: string;
};
//# sourceMappingURL=IndexSupport.d.ts.map