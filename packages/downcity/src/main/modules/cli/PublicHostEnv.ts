/**
 * city 公网 host 自动环境配置。
 *
 * 关键点（中文）
 * - `city start` 时自动探测公网 IPv4，并写入 Console Env 的 `DOWNCITY_PUBLIC_HOST`。
 * - 若部署环境已经注入 `DOWNCITY_PUBLIC_URL/HOST`，绝不覆盖。
 * - 写入 Console Env 后，后续 agent daemon 启动会通过 `context.globalEnv` 读取到该值。
 */

import { ConsoleStore } from "@/shared/utils/store/index.js";
import type {
  CityPublicHostEnvEntry,
  CityPublicHostEnvResult,
  EnsureCityPublicHostEnvInput,
} from "@/types/city/PublicHostEnv.js";

const PUBLIC_HOST_DESCRIPTION = "Auto-detected public host for agent contact links.";

function isIpv4Address(value: string): boolean {
  const parts = String(value || "").trim().split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const num = Number.parseInt(part, 10);
    return num >= 0 && num <= 255;
  });
}

async function resolvePublicIpv4FromNetwork(): Promise<string | null> {
  if (typeof fetch !== "function") return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 800);
  try {
    const response = await fetch("https://api.ipify.org?format=json", {
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = (await response.json().catch(() => null)) as {
      ip?: unknown;
    } | null;
    const ip = String(data?.ip || "").trim();
    return isIpv4Address(ip) ? ip : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function readGlobalEnvFromStore(): Record<string, string> {
  const store = new ConsoleStore();
  try {
    return store.getGlobalEnvMapSync();
  } catch {
    return {};
  } finally {
    store.close();
  }
}

async function upsertGlobalEnvToStore(entry: CityPublicHostEnvEntry): Promise<void> {
  const store = new ConsoleStore();
  try {
    await store.upsertEnvEntry({
      scope: "global",
      key: entry.key,
      value: entry.value,
      description: entry.description,
    });
  } finally {
    store.close();
  }
}

/**
 * 确保 city 全局环境中存在自动探测的公网 host。
 */
export async function ensureCityPublicHostEnv(
  input: EnsureCityPublicHostEnvInput = {},
): Promise<CityPublicHostEnvResult> {
  const env = input.env || process.env;
  const globalEnv = input.readGlobalEnv ? input.readGlobalEnv() : readGlobalEnvFromStore();
  const hasRuntimePublicAddress = Boolean(
    String(env.DOWNCITY_PUBLIC_URL || globalEnv.DOWNCITY_PUBLIC_URL || "").trim() ||
      String(env.DOWNCITY_PUBLIC_HOST || globalEnv.DOWNCITY_PUBLIC_HOST || "").trim(),
  );
  if (hasRuntimePublicAddress) {
    return {
      changed: false,
      reason: "configured",
    };
  }

  const resolved = String(
    (await (input.resolvePublicIpv4 || resolvePublicIpv4FromNetwork)()) || "",
  ).trim();
  if (!isIpv4Address(resolved)) {
    return {
      changed: false,
      reason: "unavailable",
    };
  }

  const entry: CityPublicHostEnvEntry = {
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
