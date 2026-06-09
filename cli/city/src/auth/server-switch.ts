/**
 * Server 管理模块。
 *
 * 关键说明（中文）
 * - connect City 不再强制要求 admin_secret_key
 * - admin access 只在低频管理场景中单独配置
 * - server 仍然作为本地连接记录持久化保存
 */

import { City } from "@downcity/city";
import { isCancel, password, select, text } from "../tui/Prompts.js";
import {
  addServer,
  readActiveServer,
  readConfig,
  readServer,
  removeServer,
  setActiveServer,
  type ServerProfile,
  updateServer,
} from "../core/session.js";
import { showError, showSuccess } from "../core/ui.js";
import { t } from "../i18n.js";

const CITY_BASE_URL_EXAMPLE = "https://your-city.example.com";

/**
 * 添加 server。
 */
export async function promptAddServer(): Promise<ServerProfile | undefined> {
  const baseUrl = await text({
    message: t({
      zh: "Server URL",
      en: "Server URL",
    }),
    placeholder: CITY_BASE_URL_EXAMPLE,
  });
  if (!baseUrl || isCancel(baseUrl) || !String(baseUrl).trim()) {
    return undefined;
  }

  const server = addServer({
    base_url: String(baseUrl).trim(),
  });

  const verified = await verifyServerPublicAccess(server);
  if (verified) {
    showSuccess(t({
      zh: `City 已连接：${server.name}`,
      en: `City connected: ${server.name}`,
    }));
  } else {
    showError(t({
      zh: `City 已保存，但公共可达性检查失败：${server.name}`,
      en: `City saved, but the public reachability check failed: ${server.name}`,
    }));
  }

  return server;
}

export async function promptSelectActiveServer(): Promise<ServerProfile | undefined> {
  const config = readConfig();
  if (config.servers.length === 0) {
    showError(t({
      zh: "当前没有已配置的 server。",
      en: "No servers configured.",
    }));
    return undefined;
  }

  const selected = await select({
    message: t({
      zh: "选择当前激活的 server",
      en: "Select active server",
    }),
    options: config.servers.map((server) => ({
      label: server.base_url === config.active_server_url ? `★ ${server.name}` : `   ${server.name}`,
      value: server.base_url,
      hint: server.base_url,
    })),
  });

  if (!selected || isCancel(selected)) {
    return undefined;
  }

  const selected_base_url = String(selected);
  setActiveServer(selected_base_url);
  showSuccess(t({
    zh: `当前 City：${selected_base_url}`,
    en: `Current City: ${selected_base_url}`,
  }));
  return readServer(selected_base_url);
}

export async function promptEditServer(baseUrl?: string): Promise<ServerProfile | undefined> {
  const config = readConfig();
  if (config.servers.length === 0) {
    showError(t({
      zh: "当前没有已配置的 server。",
      en: "No servers configured.",
    }));
    return undefined;
  }

  const targetBaseUrl = baseUrl ?? await select({
    message: t({
      zh: "编辑 server",
      en: "Edit server",
    }),
    options: config.servers.map((server) => ({
      label: server.base_url === config.active_server_url ? `★ ${server.name}` : `   ${server.name}`,
      value: server.base_url,
      hint: server.base_url,
    })),
  });
  if (!targetBaseUrl || isCancel(targetBaseUrl)) {
    return undefined;
  }

  const current = readServer(String(targetBaseUrl));
  if (!current) {
    showError(t({
      zh: "所选 server 已不存在。",
      en: "Selected server no longer exists.",
    }));
    return undefined;
  }

  const field = await select({
    message: t({
      zh: `编辑 ${current.name}`,
      en: `Edit ${current.name}`,
    }),
    options: [
      {
        label: t({
          zh: "名称",
          en: "Name",
        }),
        value: "name",
        hint: current.name,
      },
      {
        label: t({
          zh: "Server URL",
          en: "Server URL",
        }),
        value: "base_url",
        hint: current.base_url,
      },
      {
        label: t({
          zh: "取消",
          en: "Cancel",
        }),
        value: "cancel",
        hint: t({
          zh: "不做修改直接返回",
          en: "Return without changes",
        }),
      },
    ],
  });
  if (!field || isCancel(field) || field === "cancel") {
    return undefined;
  }

  const next = { ...current };

  if (field === "name") {
    const name = await text({
      message: t({
        zh: "显示名称",
        en: "Display name",
      }),
      initialValue: current.name,
    });
    if (!name || isCancel(name)) return undefined;
    next.name = String(name).trim() || current.name;
  } else if (field === "base_url") {
    const baseUrl = await text({
      message: t({
        zh: "Server URL",
        en: "Server URL",
      }),
      initialValue: current.base_url,
    });
    if (!baseUrl || isCancel(baseUrl)) return undefined;
    next.base_url = String(baseUrl).trim() || current.base_url;
  }

  const updated = updateServer(current.base_url, next);
  const verified = await verifyServerPublicAccess(updated);
  if (verified) {
    showSuccess(t({
      zh: `City 已更新：${updated.name}`,
      en: `City updated: ${updated.name}`,
    }));
  } else {
    showError(t({
      zh: `City 已保存，但公共可达性检查失败：${updated.name}`,
      en: `City saved, but the public reachability check failed: ${updated.name}`,
    }));
  }
  return updated;
}

/**
 * 为当前 server 单独配置 admin access。
 */
export async function promptConfigureAdminAccess(
  baseUrl: string,
): Promise<ServerProfile | undefined> {
  const current = readServer(baseUrl);
  if (!current) {
    showError(t({
      zh: "所选 server 已不存在。",
      en: "Selected server no longer exists.",
    }));
    return undefined;
  }

  const adminSecretKey = await password({
    message: t({
      zh: "admin_secret_key",
      en: "admin_secret_key",
    }),
  });
  if (!adminSecretKey || isCancel(adminSecretKey) || !String(adminSecretKey).trim()) {
    return undefined;
  }

  const updated = updateServer(current.base_url, {
    ...current,
    admin_secret_key: String(adminSecretKey).trim(),
  });

  const verified = await verifyServerAdminAccess(updated);
  if (verified) {
    showSuccess(t({
      zh: `Admin 访问已配置：${updated.name}`,
      en: `Admin access configured: ${updated.name}`,
    }));
  } else {
    showError(t({
      zh: `City 已保存，但 admin 校验失败：${updated.name}`,
      en: `City saved, but admin verification failed: ${updated.name}`,
    }));
  }

  return updated;
}

export async function promptRemoveServer(baseUrl?: string): Promise<boolean> {
  const config = readConfig();
  if (config.servers.length === 0) {
    showError(t({
      zh: "当前没有已配置的 server。",
      en: "No servers configured.",
    }));
    return false;
  }

  const selected = baseUrl ?? await select({
    message: t({
      zh: "移除 server",
      en: "Remove server",
    }),
    options: [
      ...config.servers.map((server) => ({
        label: `${server.base_url === config.active_server_url ? "★ " : ""}${server.name}`,
        value: server.base_url,
        hint: server.base_url,
      })),
      {
        label: t({
          zh: "取消",
          en: "Cancel",
        }),
        value: "cancel",
        hint: t({
          zh: "不做修改直接返回",
          en: "Return without changes",
        }),
      },
    ],
  });
  if (!selected || isCancel(selected) || selected === "cancel") {
    return false;
  }

  removeServer(String(selected));
  const nextActive = readActiveServer();
  showSuccess(
    nextActive
      ? t({
        zh: `Server 已移除。当前 server：${nextActive.name}`,
        en: `Server removed. Current server: ${nextActive.name}`,
      })
      : t({
        zh: "Server 已移除。当前没有已配置的 server。",
        en: "Server removed. No servers configured.",
      }),
  );
  return true;
}

async function verifyServerAdminAccess(server: ServerProfile): Promise<boolean> {
  try {
    const admin = new City({
      role: "admin",
      city_url: server.base_url,
      admin_secret_key: server.admin_secret_key,
    });
    await admin.listServices();
    return true;
  } catch {
    return false;
  }
}

async function verifyServerPublicAccess(server: ServerProfile): Promise<boolean> {
  try {
    const user = new City({
      role: "user",
      city_url: server.base_url,
    });
    await user.service("accounts").get("providers");
    return true;
  } catch {
    return false;
  }
}

function maskSecret(value: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "(missing)";
  if (normalized.length <= 8) return `${normalized.slice(0, 2)}***`;
  return `${normalized.slice(0, 4)}***${normalized.slice(-2)}`;
}
