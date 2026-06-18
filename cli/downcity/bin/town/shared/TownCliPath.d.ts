/**
 * Town CLI 入口路径解析。
 *
 * 关键点（中文）
 * - City 管理 CLI 不能再内置 Town 命令源码。
 * - 当 City 控制面需要启动 Agent daemon 时，应调用同一个 downcity 安装包里的 `town` 入口。
 * - 本模块只解析本机入口路径，不承担 Town 命令实现。
 */
/**
 * 解析当前安装环境中的 `town` CLI 入口。
 */
export declare function resolveTownCliPath(): string;
//# sourceMappingURL=TownCliPath.d.ts.map