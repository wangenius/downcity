/**
 * Console 公网模式持久化配置。
 *
 * 关键点（中文）
 * - `town public` 只管理 Console / control plane 的对外监听配置。
 * - 配置统一落在平台级 `downcity.db`，避免再引入新的散落文件。
 * - CLI 显式传参优先级高于持久化配置，保证脚本化调用可预测。
 */
import type { ControlPlaneStartOptions } from "./ControlPlaneRuntime.js";
/**
 * Console 公网模式持久化配置。
 */
export interface ControlPlanePublicModeSetting {
    /**
     * 是否启用公网模式。
     */
    enabled: boolean;
    /**
     * 公网模式绑定 host。
     *
     * 为空时回退到 `0.0.0.0`。
     */
    host?: string;
}
/**
 * 归一化公网模式配置。
 */
export declare function normalizeControlPlanePublicModeSetting(input: Partial<ControlPlanePublicModeSetting> | null | undefined): ControlPlanePublicModeSetting;
/**
 * 读取公网模式配置。
 */
export declare function readControlPlanePublicModeSetting(): Promise<ControlPlanePublicModeSetting>;
/**
 * 同步读取公网模式配置。
 */
export declare function readControlPlanePublicModeSettingSync(): ControlPlanePublicModeSetting;
/**
 * 保存公网模式配置。
 */
export declare function writeControlPlanePublicModeSetting(input: Partial<ControlPlanePublicModeSetting> | null | undefined): Promise<ControlPlanePublicModeSetting>;
/**
 * 判断是否应按持久化配置自动启动 Console。
 */
export declare function shouldAutoStartControlPlaneFromPersistedMode(): Promise<boolean>;
/**
 * 将持久化公网配置合并到启动参数。
 *
 * 关键点（中文）
 * - 只在没有显式 `public/host` 参数时才回填持久化配置。
 * - 显式传 `--public false` 或 `--host ...` 时，始终以显式值为准。
 */
export declare function mergePersistedControlPlaneStartOptions(input?: ControlPlaneStartOptions): Promise<ControlPlaneStartOptions>;
//# sourceMappingURL=ControlPlanePublicMode.d.ts.map