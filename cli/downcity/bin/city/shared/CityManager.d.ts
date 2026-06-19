/**
 * `city` 裸命令交互式首页。
 *
 * 关键点（中文）
 * - 裸 `city` 是本机 Agent 与 Plugin 操作台，不是 City 资源管理器。
 * - City 只作为连接上下文进入 City；模型和服务资源仍回到 `city` CLI 管理。
 */
interface CityHelpProgram {
    /** 输出当前 City 根命令帮助。 */
    outputHelp: () => void;
}
/**
 * 运行 `city` 裸命令交互式首页。
 */
export declare function runInteractiveCityManager(params: {
    /**
     * City 根命令帮助输出器。
     */
    program: CityHelpProgram;
    /**
     * 当前 CLI 入口路径，用于启动或重启 City runtime。
     */
    cli_path: string;
}): Promise<void>;
export {};
//# sourceMappingURL=CityManager.d.ts.map