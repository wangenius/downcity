/**
 * AgentStartOptions：City CLI 启动 Agent 进程时使用的参数类型。
 *
 * 关键点（中文）
 * - 这是 City 管理 Agent 进程和 HTTP gateway 的内部 CLI 类型。
 * - Agent SDK 不暴露 daemon / HTTP gateway 启停参数，避免协议归属混淆。
 */
/**
 * City Agent start / restart 命令参数。
 */
export interface AgentStartOptions {
    /** City Agent HTTP gateway 监听端口。 */
    port?: number | string;
    /** City Agent HTTP gateway 监听主机。 */
    host?: string;
    /** Agent 本机 RPC 监听端口。 */
    rpcPort?: number | string;
    /** 是否以前台模式启动。 */
    foreground?: boolean | string;
}
//# sourceMappingURL=AgentStartOptions.d.ts.map