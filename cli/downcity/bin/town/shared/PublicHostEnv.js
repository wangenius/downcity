/**
 * Town 公网 host 自动环境配置。
 *
 * 关键点（中文）
 * - `town start` 时自动探测公网 IPv4，并写入平台 Env 的 `DOWNCITY_PUBLIC_HOST`。
 * - 若部署环境已经注入 `DOWNCITY_PUBLIC_URL/HOST`，绝不覆盖。
 * - 写入平台 Env 后，后续 Town 宿主会在启动 Agent/模型运行时前显式读取并传入。
 */
import { PlatformStore } from "../town/store/index.js";
const PUBLIC_HOST_DESCRIPTION = "Auto-detected public host for agent contact links.";
function isIpv4Address(value) {
    const parts = String(value || "").trim().split(".");
    if (parts.length !== 4)
        return false;
    return parts.every((part) => {
        if (!/^\d+$/.test(part))
            return false;
        const num = Number.parseInt(part, 10);
        return num >= 0 && num <= 255;
    });
}
async function resolvePublicIpv4FromNetwork() {
    if (typeof fetch !== "function")
        return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);
    try {
        const response = await fetch("https://api.ipify.org?format=json", {
            signal: controller.signal,
        });
        if (!response.ok)
            return null;
        const data = (await response.json().catch(() => null));
        const ip = String(data?.ip || "").trim();
        return isIpv4Address(ip) ? ip : null;
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timeout);
    }
}
function readGlobalEnvFromStore() {
    const store = new PlatformStore();
    try {
        return store.getEnvMapSync();
    }
    catch {
        return {};
    }
    finally {
        store.close();
    }
}
async function upsertGlobalEnvToStore(entry) {
    const store = new PlatformStore();
    try {
        await store.upsertEnvEntry({
            scope: "global",
            key: entry.key,
            value: entry.value,
            description: entry.description,
        });
    }
    finally {
        store.close();
    }
}
/**
 * 确保 Town 全局环境中存在自动探测的公网 host。
 */
export async function ensureBayPublicHostEnv(input = {}) {
    const env = input.env || process.env;
    const globalEnv = input.readGlobalEnv ? input.readGlobalEnv() : readGlobalEnvFromStore();
    const hasRuntimePublicAddress = Boolean(String(env.DOWNCITY_PUBLIC_URL || globalEnv.DOWNCITY_PUBLIC_URL || "").trim() ||
        String(env.DOWNCITY_PUBLIC_HOST || globalEnv.DOWNCITY_PUBLIC_HOST || "").trim());
    if (hasRuntimePublicAddress) {
        return {
            changed: false,
            reason: "configured",
        };
    }
    const resolved = String((await (input.resolvePublicIpv4 || resolvePublicIpv4FromNetwork)()) || "").trim();
    if (!isIpv4Address(resolved)) {
        return {
            changed: false,
            reason: "unavailable",
        };
    }
    const entry = {
        key: "DOWNCITY_PUBLIC_HOST",
        value: resolved,
        description: PUBLIC_HOST_DESCRIPTION,
    };
    await (input.upsertGlobalEnv || upsertGlobalEnvToStore)(entry);
    env.DOWNCITY_PUBLIC_HOST = resolved;
    return {
        changed: true,
        key: "DOWNCITY_PUBLIC_HOST",
        value: resolved,
    };
}
//# sourceMappingURL=PublicHostEnv.js.map