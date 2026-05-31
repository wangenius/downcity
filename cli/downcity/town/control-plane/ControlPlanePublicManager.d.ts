/**
 * `town public`：Console 公网模式管理器。
 *
 * 关键点（中文）
 * - 同时支持交互式 manager 与 `on/off/status` 直达命令。
 * - 只管理 Console / control plane 的公网暴露，不改 agent daemon 监听。
 * - 修改配置后，若 Console 正在运行，则自动重启使新绑定立即生效。
 */
/**
 * `town public` 命令入口。
 */
export declare function controlPlanePublicCommand(params: {
    action?: string;
    host?: string;
    cliPath: string;
}): Promise<void>;
//# sourceMappingURL=ControlPlanePublicManager.d.ts.map