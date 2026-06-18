/**
 * Server 管理模块。
 *
 * 关键说明（中文）
 * - connect City 不再强制要求 admin_secret_key
 * - admin access 只在低频管理场景中单独配置
 * - server 仍然作为本地连接记录持久化保存
 */
import { type ServerProfile } from "../core/session.js";
/**
 * 添加 server。
 */
export declare function promptAddServer(): Promise<ServerProfile | undefined>;
export declare function promptSelectActiveServer(): Promise<ServerProfile | undefined>;
export declare function promptEditServer(baseUrl?: string): Promise<ServerProfile | undefined>;
/**
 * 为当前 server 单独配置 admin access。
 */
export declare function promptConfigureAdminAccess(baseUrl: string): Promise<ServerProfile | undefined>;
export declare function promptRemoveServer(baseUrl?: string): Promise<boolean>;
//# sourceMappingURL=server-switch.d.ts.map