/**
 * City 首页菜单模块。
 *
 * 关键说明（中文）
 * - 首次使用时，主动作是 connect City base。
 * - 日常使用时，首页围绕当前激活的 City admin 工作区展开。
 */

import { isCancel, select } from "@clack/prompts";
import { readActiveServer } from "../core/session.js";
import { type HomeAction, type WelcomeAction } from "../types/Interactive.js";
import { getCliLocale, t } from "../i18n.js";

/**
 * 首次启动时选择动作。
 */
export async function selectWelcomeAction(): Promise<WelcomeAction> {
  const current_locale = getCliLocale();
  const selected = await select({
    message: t({
      zh: "欢迎使用 City",
      en: "Welcome to City",
    }),
    options: [
      {
        label: t({
          zh: "连接现有 City",
          en: "Connect an existing City",
        }),
        value: "connect_city",
        hint: t({
          zh: "添加一个 City base URL 以便进行管理",
          en: "Add a City base URL for admin management",
        }),
      },
      {
        label: t({
          zh: "切换语言",
          en: "Language",
        }),
        value: "set_language",
        hint: formatLocaleHint(current_locale),
      },
      {
        label: t({
          zh: "升级 CLI",
          en: "Upgrade CLI",
        }),
        value: "update",
        hint: t({
          zh: "刷新全局 city 命令",
          en: "Refresh the global city command",
        }),
      },
      {
        label: t({
          zh: "退出",
          en: "Exit",
        }),
        value: "quit",
      },
    ],
  });

  if (!selected || isCancel(selected)) {
    return "quit";
  }

  return selected as WelcomeAction;
}

/**
 * 已经有 City server 时的首页动作。
 */
export async function selectHomeAction(): Promise<HomeAction> {
  const active_server = readActiveServer();
  if (!active_server) {
    return "connect_city";
  }
  const current_locale = getCliLocale();

  const selected = await select({
    message: t({
      zh: `City [${active_server.name}]`,
      en: `City [${active_server.name}]`,
    }),
    options: [
      {
        label: t({
          zh: "打开当前 City",
          en: "Open current City",
        }),
        value: "open_current",
        hint: formatServerSummary(active_server.base_url, Boolean(active_server.admin_secret_key)),
      },
      {
        label: t({
          zh: "切换 City",
          en: "Switch City",
        }),
        value: "switch_city",
        hint: t({
          zh: "选择另一个已连接的 City",
          en: "Choose another connected City",
        }),
      },
      {
        label: t({
          zh: "连接另一个 City",
          en: "Connect another City",
        }),
        value: "connect_city",
        hint: t({
          zh: "添加新的 City server URL",
          en: "Add a new City server URL",
        }),
      },
      {
        label: t({
          zh: "切换语言",
          en: "Language",
        }),
        value: "set_language",
        hint: formatLocaleHint(current_locale),
      },
      {
        label: t({
          zh: "升级 CLI",
          en: "Upgrade CLI",
        }),
        value: "update",
        hint: t({
          zh: "刷新全局 city 命令",
          en: "Refresh the global city command",
        }),
      },
      {
        label: t({
          zh: "退出",
          en: "Exit",
        }),
        value: "quit",
      },
    ],
  });

  if (!selected || isCancel(selected)) {
    return "quit";
  }

  return selected as HomeAction;
}

function formatServerSummary(base_url: string, has_admin_access: boolean): string {
  return has_admin_access
    ? t({
      zh: `${base_url} · 已配置 admin 访问`,
      en: `${base_url} · admin access configured`,
    })
    : t({
      zh: `${base_url} · 需要配置 admin 访问`,
      en: `${base_url} · admin access required`,
    });
}

function formatLocaleHint(locale: "zh" | "en"): string {
  if (locale === "zh") {
    return t({
      zh: "当前：中文",
      en: "Current: Chinese",
    });
  }

  return t({
    zh: "当前：英文",
    en: "Current: English",
  });
}
