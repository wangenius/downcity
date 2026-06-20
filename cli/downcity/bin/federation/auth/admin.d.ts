/**
 * Admin 鉴权模块。
 *
 * 当前版本直接复用当前 active server 上保存的 admin_secret_key。
 */
import { type AdminSession, type ServerProfile } from "../../federation/core/session.js";
export declare function adminAuth(server: ServerProfile): Promise<AdminSession | undefined>;
//# sourceMappingURL=admin.d.ts.map