/**
 * `town` 裸命令交互式首页。
 *
 * 关键点（中文）
 * - 裸 `town` 是本机 Agent 与 Plugin 操作台，不是 City 资源管理器。
 * - City 只作为连接上下文进入 Town；模型和服务资源仍回到 `city` CLI 管理。
 */
interface TownHelpProgram {
    /** 输出当前 Town 根命令帮助。 */
    outputHelp: () => void;
}
/**
 * 运行 `town` 裸命令交互式首页。
 */
export declare function runInteractiveTownManager(params: {
    /**
     * Town 根命令帮助输出器。
     */
    program: TownHelpProgram;
    /**
     * 当前 CLI 入口路径，用于启动或重启 Town runtime。
     */
    cli_path: string;
}): Promise<void>;
export {};
//# sourceMappingURL=TownManager.d.ts.map