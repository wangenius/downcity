/**
 * `city` 裸命令交互式首页。
 *
 * 关键点（中文）
 * - 裸 `city` 是本机 Agent 与 Plugin 操作台，不是 City 资源管理器。
 * - City 通过 Federation 成员资格访问共享资源；Federation 管理由 `city federation` 子命令负责。
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