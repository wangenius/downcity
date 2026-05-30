/**
 * Console 公网模式持久化配置。
 *
 * 关键点（中文）
 * - `city public` 只管理 Console / control plane 的对外监听配置。
 * - 配置统一落在平台级 `downcity.db`，避免再引入新的散落文件。
 * - CLI 显式传参优先级高于持久化配置，保证脚本化调用可预测。
 */

import { PlatformStore } from "@/platform/store/index.js";
import type { ControlPlaneStartOptions } from "./ControlPlaneRuntime.js";

const CONTROL_PLANE_PUBLIC_MODE_SETTING_KEY = "city.controlPlane.publicMode";
const DEFAULT_PUBLIC_BIND_HOST = "0.0.0.0";

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

function normalizePublicModeHost(input: unknown): string {
  return String(input || "").trim();
}

/**
 * 归一化公网模式配置。
 */
export function normalizeControlPlanePublicModeSetting(
  input: Partial<ControlPlanePublicModeSetting> | null | undefined,
): ControlPlanePublicModeSetting {
  const enabled = input?.enabled === true;
  const host = normalizePublicModeHost(input?.host);
  return enabled
    ? {
        enabled: true,
        host: host || DEFAULT_PUBLIC_BIND_HOST,
      }
    : {
        enabled: false,
      };
}

/**
 * 读取公网模式配置。
 */
export async function readControlPlanePublicModeSetting(): Promise<ControlPlanePublicModeSetting> {
  const store = new PlatformStore();
  try {
    const raw = await store.getSecureSettingJson<Partial<ControlPlanePublicModeSetting>>(
      CONTROL_PLANE_PUBLIC_MODE_SETTING_KEY,
    );
    return normalizeControlPlanePublicModeSetting(raw);
  } finally {
    store.close();
  }
}

/**
 * 同步读取公网模式配置。
 */
export function readControlPlanePublicModeSettingSync(): ControlPlanePublicModeSetting {
  const store = new PlatformStore();
  try {
    const raw = store.getSecureSettingJsonSync<Partial<ControlPlanePublicModeSetting>>(
      CONTROL_PLANE_PUBLIC_MODE_SETTING_KEY,
    );
    return normalizeControlPlanePublicModeSetting(raw);
  } finally {
    store.close();
  }
}

/**
 * 保存公网模式配置。
 */
export async function writeControlPlanePublicModeSetting(
  input: Partial<ControlPlanePublicModeSetting> | null | undefined,
): Promise<ControlPlanePublicModeSetting> {
  const normalized = normalizeControlPlanePublicModeSetting(input);
  const store = new PlatformStore();
  try {
    await store.setSecureSettingJson(CONTROL_PLANE_PUBLIC_MODE_SETTING_KEY, normalized);
    return normalized;
  } finally {
    store.close();
  }
}

/**
 * 判断是否应按持久化配置自动启动 Console。
 */
export async function shouldAutoStartControlPlaneFromPersistedMode(): Promise<boolean> {
  const setting = await readControlPlanePublicModeSetting();
  return setting.enabled === true;
}

/**
 * 将持久化公网配置合并到启动参数。
 *
 * 关键点（中文）
 * - 只在没有显式 `public/host` 参数时才回填持久化配置。
 * - 显式传 `--public false` 或 `--host ...` 时，始终以显式值为准。
 */
export async function mergePersistedControlPlaneStartOptions(
  input?: ControlPlaneStartOptions,
): Promise<ControlPlaneStartOptions> {
  const explicitHost = String(input?.host || "").trim();
  const hasExplicitHost = Boolean(explicitHost);
  const hasExplicitPublic = typeof input?.public === "boolean";
  if (hasExplicitHost || hasExplicitPublic) {
    return {
      ...input,
      ...(hasExplicitHost ? { host: explicitHost } : {}),
    };
  }

  const persisted = await readControlPlanePublicModeSetting();
  if (persisted.enabled !== true) {
    return {
      ...input,
    };
  }

  return {
    ...input,
    public: true,
    host: persisted.host || DEFAULT_PUBLIC_BIND_HOST,
  };
}
