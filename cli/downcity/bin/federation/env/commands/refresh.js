/**
 * City env runtime cache 刷新命令。
 *
 * 关键说明（中文）
 * - 这个命令只负责脚本化调用当前 active City 的 env refresh。
 * - 真正刷新逻辑位于 City SDK 与服务端 EnvService，CLI 不复制业务规则。
 */
import { City } from "@downcity/city";
import { adminAuth } from "../../../federation/auth/admin.js";
import { adminErrorMessage, rethrowAdminAuthError } from "../../../federation/admin/auth-error.js";
import { readActiveServer } from "../../../federation/core/session.js";
import { showError, showSuccess } from "../../../federation/core/ui.js";
import { t } from "../../../shared/CliLocale.js";
/**
 * 刷新当前 active City 的 runtime env cache。
 */
export async function refreshEnvCache() {
    const active_server = readActiveServer();
    if (!active_server) {
        showError(t({
            zh: "当前没有激活的 City server。请先运行 `city` 连接一个。",
            en: "No active City server. Run `city` to connect one first.",
        }));
        return;
    }
    const session = await adminAuth(active_server);
    if (!session) {
        return;
    }
    const admin = new City({
        role: "admin",
        federation_url: session.base_url,
        admin_secret_key: session.admin_secret_key,
    });
    try {
        const result = await admin.env.refresh();
        showSuccess(t({
            zh: `env runtime cache 已刷新（${result.count} 个 key）`,
            en: `env runtime cache refreshed (${result.count} keys)`,
        }));
    }
    catch (error) {
        rethrowAdminAuthError(error);
        showError(adminErrorMessage(error));
    }
}
//# sourceMappingURL=refresh.js.map