/**
 * Town City 连接持久化全屏 TUI。
 *
 * 关键点（中文）
 * - 裸 `town city` 使用这个界面，所有状态、loading 和结果都保留在 TUI 右侧。
 * - `town city status/list/whoami/...` 子命令仍由 shared/CityConnection 负责 stdout 输出。
 * - 需要输入的动作会临时进入现有 prompt TUI，完成后回到本界面并展示结果。
 */

import blessed from "neo-blessed";
import {
  DEFAULT_CITY_URL,
  DEFAULT_TOWN_ID,
  listTownCityServers,
  normalizeCityUrl,
  readCurrentTownCitySession,
  readPersistedTownCliLocale,
  readTownCityState,
  readCityString,
  resolveSelectedBaseUrl,
  upsertTownProfile,
  writeTownCityState,
} from "../shared/CityStateStore.js";
import { performTownCityUserLogin } from "../shared/CityUserLogin.js";
import { CityUserManager } from "../shared/CityUserManager.js";
import {
  readCurrentTownCityBalance,
  rechargeCurrentTownCityUser,
} from "../shared/CityBalance.js";
import { promptAndPersistTownCliLocale } from "../shared/InteractiveLocale.js";
import { getCliLocale, t } from "../shared/CliLocale.js";
import prompts from "./Prompts.js";
import {
  is_disabled_selectable_item,
  resolve_loop_selectable_index,
  resolve_next_loop_selectable_index,
} from "./SelectableList.js";
import type { TownCityConnectionState, TownCityServerProfile } from "../types/TownCityConnection.js";
import type { TownCityBalanceAccount, TownCityRechargeResult } from "../types/TownCityBalance.js";
import type { TownCityUserSession } from "../types/TownCitySession.js";
import type { tui_list_item } from "../types/Tui.js";

type city_manager_action =
  | "status"
  | "use"
  | "connect"
  | "list"
  | "login"
  | "whoami"
  | "recharge"
  | "logout"
  | "language"
  | "exit";

interface blessed_list_element extends blessed.Widgets.ListElement {
  on: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => blessed_list_element;
  key: (
    keys: string | string[],
    listener: (...args: unknown[]) => void,
  ) => blessed_list_element;
  focus: () => void;
  select: (index: number) => void;
  setItems: (items: blessed.Widgets.ListElementItem[]) => void;
  selected?: number;
}

interface city_manager_shell {
  /** blessed 全屏根节点。 */
  screen: blessed.Widgets.Screen;

  /** 左侧菜单容器。 */
  sidebar_box: blessed.Widgets.BoxElement;

  /** 右侧详情容器。 */
  main_box: blessed.Widgets.BoxElement;

  /** 右侧标题区。 */
  header_box: blessed.Widgets.BoxElement;

  /** 右侧详情文本区。 */
  detail_box: blessed.Widgets.BoxElement;

  /** 底部操作提示区。 */
  footer_box: blessed.Widgets.BoxElement;
}

interface city_manager_state {
  /** 左侧菜单项。 */
  items: tui_list_item[];

  /** 顶部副标题。 */
  subtitle: string;

  /** 当前 City 连接状态。 */
  connection: TownCityConnectionState;

  /** 当前余额摘要。 */
  balance?: TownCityBalanceAccount | null;

  /** 余额读取错误。 */
  balance_error?: string;

  /** 右侧详情覆盖内容。 */
  detail_override?: string;

  /** 最近一次动作结果。 */
  last_message?: string;

  /** 初始聚焦动作。 */
  initial_action?: city_manager_action;
}

interface city_manager_runtime {
  /** 是否已经退出。 */
  finished: boolean;

  /** 当前聚焦索引。 */
  selected_index: number;

  /** TUI 状态。 */
  state: city_manager_state;
}

const cityUserManager = new CityUserManager();

function read_city_connection_state(): TownCityConnectionState {
  const state = readTownCityState();
  const city_url = resolveSelectedBaseUrl(state);
  const session = state.sessions?.[city_url] ?? null;
  if (session?.user_token) {
    return {
      city_url,
      town_id: session.town_id || DEFAULT_TOWN_ID,
      has_user_token: true,
      source: "town-session",
      user_id: session.user_id,
      user_label: session.user_label,
    };
  }

  const server = listTownCityServers().find((item) => item.base_url === city_url);
  return {
    city_url,
    town_id: DEFAULT_TOWN_ID,
    has_user_token: false,
    source: server?.source === "city-admin"
      ? "city-admin"
      : server?.source === "town"
        ? "town-base"
        : "default",
  };
}

function save_town_city_user_session(session: TownCityUserSession): void {
  const state = upsertTownProfile(readTownCityState(), {
    base_url: session.base_url,
  });
  const sessions = {
    ...(state.sessions ?? {}),
    [session.base_url]: session,
  };
  writeTownCityState({
    ...state,
    selected_base_url: session.base_url,
    sessions,
  });
}

/**
 * 打开 City 连接管理 TUI。
 */
export async function open_city_manager_tui(): Promise<void> {
  let next_state_params: {
    initial_action?: city_manager_action;
    detail_override?: string;
    last_message?: string;
  } | undefined;

  while (true) {
    const initial_state = await build_city_manager_state(next_state_params);
    const prompt_action = await run_city_manager_screen(initial_state);
    if (!prompt_action) return;
    next_state_params = await handle_city_prompt_action(prompt_action);
  }
}

async function run_city_manager_screen(
  initial_state: city_manager_state,
): Promise<city_manager_action | null> {
  return await new Promise<city_manager_action | null>((resolve) => {
    const shell = create_city_manager_shell(initial_state);
    const runtime: city_manager_runtime = {
      finished: false,
      selected_index: initial_state.initial_action
        ? find_action_index(initial_state.items, initial_state.initial_action)
        : resolve_loop_selectable_index(initial_state.items, 0, 0),
      state: initial_state,
    };

    const finish = (value: city_manager_action | null): void => {
      if (runtime.finished) return;
      runtime.finished = true;
      shell.screen.destroy();
      resolve(value);
    };

    const list = blessed.list({
      parent: shell.sidebar_box,
      top: 2,
      left: 0,
      width: "100%",
      height: "100%-2",
      keys: false,
      vi: false,
      mouse: true,
      style: {
        item: { fg: "white" },
        selected: {
          fg: "black",
          bg: "green",
          bold: true,
        },
      },
      items: runtime.state.items.map(format_city_item_label),
    }) as blessed_list_element;

    const render = (): void => {
      const item = runtime.state.items[runtime.selected_index];
      list.setItems(runtime.state.items.map(format_city_item_label));
      list.select(runtime.selected_index);
      shell.header_box.setContent(format_header(runtime.state));
      shell.detail_box.setContent(runtime.state.detail_override ?? format_city_detail(item));
      shell.footer_box.setContent(format_footer(item));
      shell.screen.render();
    };

    const refresh_state = async (params?: {
      keep_action?: city_manager_action;
      detail_override?: string;
      last_message?: string;
    }): Promise<void> => {
      const next_state = await build_city_manager_state({
        detail_override: params?.detail_override,
        last_message: params?.last_message,
      });
      runtime.state = next_state;
      if (params?.keep_action) {
        runtime.selected_index = find_action_index(next_state.items, params.keep_action);
      } else {
        runtime.selected_index = resolve_loop_selectable_index(
          next_state.items,
          runtime.selected_index,
          0,
        );
      }
      render();
    };

    const set_detail = (content: string): void => {
      runtime.state = {
        ...runtime.state,
        detail_override: content,
      };
      render();
    };

    const sync_selection = (index_value: unknown = list.selected): void => {
      runtime.selected_index = resolve_loop_selectable_index(
        runtime.state.items,
        index_value,
        runtime.selected_index,
      );
      runtime.state = {
        ...runtime.state,
        detail_override: undefined,
      };
      render();
    };

    const run_action = async (): Promise<void> => {
      sync_selection();
      const item = runtime.state.items[runtime.selected_index];
      if (is_disabled_item(item)) return;
      const action = item?.id as city_manager_action | undefined;
      if (!action) return;
      if (action === "exit") {
        finish(null);
        return;
      }
      if (is_prompt_action(action)) {
        finish(action);
        return;
      }

      await handle_city_action({
        action,
        set_detail,
        refresh_state,
      });
    };

    list.on("select item", (_item, index_value) => {
      sync_selection(index_value);
    });

    list.key(["up", "k"], () => {
      runtime.selected_index = resolve_next_loop_selectable_index(
        runtime.state.items,
        runtime.selected_index,
        -1,
      );
      sync_selection(runtime.selected_index);
    });

    list.key(["down", "j"], () => {
      runtime.selected_index = resolve_next_loop_selectable_index(
        runtime.state.items,
        runtime.selected_index,
        1,
      );
      sync_selection(runtime.selected_index);
    });

    list.key(["enter"], () => {
      void run_action();
    });

    shell.detail_box.key(["pageup"], () => {
      shell.detail_box.scroll(-Math.max(1, Math.floor((shell.detail_box.height as number) / 2)));
      shell.screen.render();
    });

    shell.detail_box.key(["pagedown"], () => {
      shell.detail_box.scroll(Math.max(1, Math.floor((shell.detail_box.height as number) / 2)));
      shell.screen.render();
    });

    shell.screen.key(["escape", "q", "C-c"], () => finish(null));

    list.focus();
    render();
  });
}

async function build_city_manager_state(params?: {
  initial_action?: city_manager_action;
  detail_override?: string;
  last_message?: string;
}): Promise<city_manager_state> {
  const connection = read_city_connection_state();
  const balance_result = connection.has_user_token
    ? await read_balance_summary()
    : { account: null, error: undefined };
  const items = build_city_items({
    connection,
    balance: balance_result.account,
    balance_error: balance_result.error,
  });

  return {
    items,
    connection,
    balance: balance_result.account,
    balance_error: balance_result.error,
    detail_override: params?.detail_override,
    last_message: params?.last_message,
    initial_action: params?.initial_action,
    subtitle: build_city_subtitle(connection, balance_result.account),
  };
}

async function read_balance_summary(): Promise<{
  account: TownCityBalanceAccount | null;
  error?: string;
}> {
  try {
    return {
      account: await readCurrentTownCityBalance(),
    };
  } catch (error) {
    return {
      account: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function build_city_items(params: {
  connection: TownCityConnectionState;
  balance: TownCityBalanceAccount | null;
  balance_error?: string;
}): tui_list_item[] {
  const items: tui_list_item[] = [
    section_item("status", t({ zh: "状态", en: "Status" })),
    {
      id: "status",
      title: t({ zh: "查看连接状态", en: "View connection status" }),
      subtitle: params.connection.city_url,
      detail: format_connection_detail(params.connection),
    },
    section_item("city", "City"),
    {
      id: "use",
      title: t({ zh: "选择 City", en: "Select City" }),
      subtitle: t({
        zh: "从 Town / city admin / 默认候选中选择",
        en: "Choose from Town, city admin, or default candidates",
      }),
      detail: format_city_list_detail(listTownCityServers()),
    },
    {
      id: "connect",
      title: t({ zh: "添加 City", en: "Add City" }),
      subtitle: t({
        zh: "手动写入一个 Town 可用的 City",
        en: "Manually add a City available to Town",
      }),
      detail: t({
        zh: "输入 City URL 后会保存到 Town 本地，并设为当前 City。",
        en: "Enter a City URL to save it in Town and make it the current City.",
      }),
    },
    {
      id: "list",
      title: t({ zh: "查看可用 City", en: "List Cities" }),
      subtitle: t({
        zh: `${listTownCityServers().length} 个可用 City`,
        en: `${listTownCityServers().length} available Cities`,
      }),
      detail: format_city_list_detail(listTownCityServers()),
    },
    section_item("account", t({ zh: "账号", en: "Account" })),
  ];

  if (!params.connection.has_user_token) {
    items.push({
      id: "login",
      title: t({ zh: "登录", en: "Sign in" }),
      subtitle: t({
        zh: "登录当前 City",
        en: "Sign in to the current City",
      }),
      detail: format_login_detail(params.connection),
    });
  } else {
    items.push(
      {
        id: "whoami",
        title: t({ zh: "当前账号", en: "Current account" }),
        subtitle: params.connection.user_label || params.connection.user_id || params.connection.town_id,
        detail: format_connection_detail(params.connection),
      },
      {
        id: "balance",
        title: params.balance
          ? t({
            zh: `余额：${params.balance.balance} ${params.balance.unit}`,
            en: `Balance: ${params.balance.balance} ${params.balance.unit}`,
          })
          : t({ zh: "余额：暂不可用", en: "Balance: unavailable" }),
        subtitle: params.balance
          ? t({
            zh: `更新：${params.balance.updated_at}`,
            en: `Updated: ${params.balance.updated_at}`,
          })
          : params.balance_error ?? "",
        detail: params.balance
          ? format_balance_detail(params.balance)
          : format_error_detail(t({ zh: "余额暂不可用", en: "Balance unavailable" }), params.balance_error),
        disabled: true,
      },
      {
        id: "recharge",
        title: t({ zh: "充值", en: "Recharge" }),
        subtitle: t({
          zh: "给当前账号发起 checkout 充值",
          en: "Start a checkout recharge for the current account",
        }),
        detail: t({
          zh: "输入金额和说明后，Town 会创建充值单和 checkout 页面。",
          en: "Enter an amount and note; Town will create a topup and checkout page.",
        }),
      },
      {
        id: "logout",
        title: t({ zh: "登出", en: "Sign out" }),
        subtitle: t({
          zh: "清除当前 City 的 Town 登录态",
          en: "Clear the Town session for the current City",
        }),
        detail: t({
          zh: "只清除 Town 本地保存的当前 City 登录态，不删除 City 账号。",
          en: "Only clears Town's local session for the current City; it does not delete the City account.",
        }),
      },
    );
  }

  items.push(
    section_item("settings", t({ zh: "设置", en: "Settings" })),
    {
      id: "language",
      title: t({ zh: "切换语言", en: "Language" }),
      subtitle: format_locale_description(readPersistedTownCliLocale() ?? getCliLocale()),
      detail: t({
        zh: "切换 Town CLI 的默认语言，并保存到本地。",
        en: "Switch the default Town CLI language and persist it locally.",
      }),
    },
    section_item("navigation", t({ zh: "导航", en: "Navigation" })),
    {
      id: "exit",
      title: t({ zh: "退出", en: "Exit" }),
      subtitle: t({ zh: "关闭 City 连接管理", en: "Close City connection management" }),
      detail: t({
        zh: "退出当前 City 连接管理 TUI。",
        en: "Exit the current City connection TUI.",
      }),
    },
  );

  return items;
}

async function handle_city_action(params: {
  action: city_manager_action;
  set_detail: (content: string) => void;
  refresh_state: (state?: {
    keep_action?: city_manager_action;
    detail_override?: string;
    last_message?: string;
  }) => Promise<void>;
}): Promise<void> {
  if (params.action === "status") {
    const state = read_city_connection_state();
    await params.refresh_state({
      keep_action: "status",
      detail_override: format_connection_detail(state),
    });
    return;
  }

  if (params.action === "list") {
    await params.refresh_state({
      keep_action: "list",
      detail_override: format_city_list_detail(listTownCityServers()),
    });
    return;
  }

  if (params.action === "whoami") {
    params.set_detail(loading_text(t({ zh: "正在读取当前账号", en: "Reading current account" })));
    try {
      const user = await cityUserManager.resolveCurrentUser();
      await params.refresh_state({
        keep_action: "whoami",
        detail_override: format_current_user_detail(user),
      });
    } catch (error) {
      await params.refresh_state({
        keep_action: "whoami",
        detail_override: format_error_detail(
          t({ zh: "当前账号不可用", en: "Current account unavailable" }),
          error instanceof Error ? error.message : String(error),
        ),
      });
    }
    return;
  }

  if (params.action === "logout") {
    const city_url = resolveSelectedBaseUrl(readTownCityState());
    const state = readTownCityState();
    const sessions = { ...(state.sessions ?? {}) };
    delete sessions[city_url];
    writeTownCityState({ ...state, sessions });
    await params.refresh_state({
      keep_action: "login",
      detail_override: t({
        zh: `已登出当前 City：${city_url}`,
        en: `Signed out from current City: ${city_url}`,
      }),
    });
    return;
  }

}

async function handle_city_prompt_action(
  action: city_manager_action,
): Promise<{
  initial_action?: city_manager_action;
  detail_override?: string;
  last_message?: string;
}> {
  if (action === "connect") {
    const city_url = await prompt_city_url();
    if (!city_url) {
      return {
        initial_action: "connect",
        detail_override: t({ zh: "已取消添加 City。", en: "Add City cancelled." }),
      };
    }
    writeTownCityState(upsertTownProfile(readTownCityState(), { base_url: city_url }));
    return {
      initial_action: "status",
      detail_override: t({
        zh: `已添加并选择 City：${city_url}`,
        en: `Added and selected City: ${city_url}`,
      }),
    };
  }

  if (action === "use") {
    const server = await prompt_town_city_server();
    if (!server) {
      return {
        initial_action: "use",
        detail_override: t({ zh: "已取消选择 City。", en: "Select City cancelled." }),
      };
    }
    select_city_server(server);
    return {
      initial_action: "status",
      detail_override: t({
        zh: `已选择 City：${server.base_url}`,
        en: `Selected City: ${server.base_url}`,
      }),
    };
  }

  if (action === "login") {
    const connection = read_city_connection_state();
    const session = await performTownCityUserLogin({
      city_url: connection.city_url,
      town_id: readCurrentTownCitySession()?.town_id || DEFAULT_TOWN_ID,
    }, { silent: true });
    if (!session) {
      return {
        initial_action: "login",
        detail_override: t({ zh: "登录已取消。", en: "Sign-in cancelled." }),
      };
    }
    save_town_city_user_session(session);
    return {
      initial_action: "whoami",
      detail_override: format_session_detail(session),
    };
  }

  if (action === "recharge") {
    const input = await prompt_recharge_input();
    if (!input) {
      return {
        initial_action: "recharge",
        detail_override: t({ zh: "充值已取消。", en: "Recharge cancelled." }),
      };
    }
    try {
      const result = await rechargeCurrentTownCityUser(input);
      return {
        initial_action: "recharge",
        detail_override: format_recharge_result(result),
      };
    } catch (error) {
      return {
        initial_action: "recharge",
        detail_override: format_error_detail(
          t({ zh: "充值失败", en: "Recharge failed" }),
          error instanceof Error ? error.message : String(error),
        ),
      };
    }
  }

  if (action === "language") {
    const locale = await promptAndPersistTownCliLocale({ silent: true });
    return {
      initial_action: "language",
      detail_override: locale
        ? t({
          zh: locale === "zh" ? "当前默认语言已保存为中文。" : "当前默认语言已保存为英文。",
          en: locale === "zh"
            ? "Chinese has been saved as the default language."
            : "English has been saved as the default language.",
        })
        : t({ zh: "语言切换已取消。", en: "Language switch cancelled." }),
    };
  }

  return {
    initial_action: "status",
  };
}

function is_prompt_action(action: city_manager_action): boolean {
  return action === "connect" ||
    action === "use" ||
    action === "login" ||
    action === "recharge" ||
    action === "language";
}

function create_city_manager_shell(state: city_manager_state): city_manager_shell {
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title: "Downcity City",
    dockBorders: true,
    autoPadding: true,
  });

  screen.style = {
    bg: "black",
    fg: "white",
  };

  const sidebar_box = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "34%",
    height: "100%-3",
    border: "line",
    label: ` ${t({ zh: "City 连接", en: "City connection" })} `,
    style: {
      border: { fg: "green" },
    },
  });

  const main_box = blessed.box({
    parent: screen,
    top: 0,
    left: "34%",
    width: "66%",
    height: "100%-3",
    border: "line",
    label: ` ${t({ zh: "详情", en: "Detail" })} `,
    style: {
      border: { fg: "green" },
    },
  });

  const header_box = blessed.box({
    parent: main_box,
    top: 0,
    left: 1,
    width: "100%-2",
    height: 4,
    tags: true,
    content: format_header(state),
  });

  const detail_box = blessed.box({
    parent: main_box,
    top: 4,
    left: 0,
    width: "100%",
    height: "100%-4",
    padding: { left: 1, right: 1, top: 1, bottom: 1 },
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    mouse: true,
    style: {
      fg: "white",
    },
  });

  const footer_box = blessed.box({
    parent: screen,
    left: 0,
    bottom: 0,
    width: "100%",
    height: 3,
    padding: { left: 1, right: 1, top: 1 },
    border: "line",
    style: {
      border: { fg: "green" },
      fg: "gray",
    },
  });

  return {
    screen,
    sidebar_box,
    main_box,
    header_box,
    detail_box,
    footer_box,
  };
}

async function prompt_city_url(): Promise<string | null> {
  const response = (await prompts({
    type: "text",
    name: "city_url",
    message: "City URL",
    initial: DEFAULT_CITY_URL,
  })) as { city_url?: string };
  const city_url = normalizeCityUrl(String(response.city_url || ""));
  return city_url || null;
}

async function prompt_town_city_server(): Promise<TownCityServerProfile | null> {
  const servers = listTownCityServers();
  const response = (await prompts({
    type: "select",
    name: "base_url",
    message: t({
      zh: "选择 City",
      en: "Select City",
    }),
    choices: servers.map((server) => ({
      title: server.selected ? `* ${server.name}` : server.name,
      description: `${server.source} · ${server.base_url}`,
      value: server.base_url,
    })),
    initial: Math.max(0, servers.findIndex((server) => server.selected)),
  })) as { base_url?: string };
  const base_url = readCityString(response.base_url);
  if (!base_url) return null;
  return servers.find((server) => server.base_url === base_url) ?? null;
}

async function prompt_recharge_input(): Promise<{
  amount: number;
  method_id?: string;
  note?: string;
  open_checkout?: boolean;
} | null> {
  const response = (await prompts([
    {
      type: "number",
      name: "amount",
      message: "充值金额",
      min: 1,
      validate: (value: number) =>
        Number.isInteger(value) && value > 0 ? true : "请输入正整数",
    },
    {
      type: "text",
      name: "note",
      message: "说明（可选）",
      initial: "Town recharge",
    },
    {
      type: "confirm",
      name: "open_checkout",
      message: "创建后打开支付页面？",
      initial: true,
    },
  ])) as {
    amount?: number;
    note?: string;
    open_checkout?: boolean;
  };

  const amount = Number(response.amount);
  if (!Number.isInteger(amount) || amount <= 0) return null;

  return {
    amount,
    method_id: "stripe",
    note: readCityString(response.note),
    open_checkout: response.open_checkout !== false,
  };
}

function select_city_server(server: TownCityServerProfile): void {
  writeTownCityState(upsertTownProfile(readTownCityState(), {
    base_url: server.base_url,
    name: server.name,
  }));
}

function format_header(state: city_manager_state): string {
  return [
    `{bold}${t({ zh: "管理 City 连接", en: "Manage City connections" })}{/bold}`,
    state.subtitle,
    state.last_message ? `{green-fg}${state.last_message}{/green-fg}` : "",
  ].filter(Boolean).join("\n");
}

function format_city_item_label(item: tui_list_item): string {
  if (is_disabled_item(item)) {
    return `── ${item.title} ──`;
  }
  return item.title;
}

function format_city_detail(item: tui_list_item | undefined): string {
  if (!item) {
    return t({ zh: "未选择项目", en: "No item selected" });
  }
  if (is_disabled_item(item)) {
    return [
      `{bold}${item.title}{/bold}`,
      t({
        zh: "这是侧边栏分区标题，用于区分当前菜单里的操作区域。",
        en: "This is a sidebar section heading used to group actions in the current menu.",
      }),
    ].join("\n");
  }
  return [
    `{bold}${item.title}{/bold}`,
    item.subtitle,
    "",
    item.detail,
  ].filter(Boolean).join("\n");
}

function format_footer(item: tui_list_item | undefined): string {
  const base = t({
    zh: "Enter 执行动作 · Esc / q 退出 · ↑↓ 切换 · PgUp/PgDn 滚动详情",
    en: "Enter run action · Esc / q quit · ↑↓ navigate · PgUp/PgDn scroll detail",
  });
  if (!item || is_disabled_item(item)) return base;
  return `${base} · ${item.subtitle}`;
}

function build_city_subtitle(
  connection: TownCityConnectionState,
  balance: TownCityBalanceAccount | null,
): string {
  const login_state = connection.has_user_token
    ? t({ zh: "已登录", en: "signed in" })
    : t({ zh: "未登录", en: "not signed in" });
  const balance_text = balance
    ? t({
      zh: ` · 余额 ${balance.balance} ${balance.unit}`,
      en: ` · balance ${balance.balance} ${balance.unit}`,
    })
    : "";
  return `${connection.city_url} · ${login_state}${balance_text}`;
}

function format_connection_detail(connection: TownCityConnectionState): string {
  return t({
    zh: [
      "{bold}当前 City 连接{/bold}",
      `URL：${connection.city_url}`,
      `source：${connection.source}`,
      `town id：${connection.town_id}`,
      `登录态：${connection.has_user_token ? "已登录" : "未登录"}`,
      connection.user_id ? `账号 ID：${connection.user_id}` : "",
      connection.user_label ? `账号：${connection.user_label}` : "",
    ].filter(Boolean).join("\n"),
    en: [
      "{bold}Current City connection{/bold}",
      `URL: ${connection.city_url}`,
      `source: ${connection.source}`,
      `town id: ${connection.town_id}`,
      `session: ${connection.has_user_token ? "signed in" : "not signed in"}`,
      connection.user_id ? `account ID: ${connection.user_id}` : "",
      connection.user_label ? `account: ${connection.user_label}` : "",
    ].filter(Boolean).join("\n"),
  });
}

function format_city_list_detail(servers: TownCityServerProfile[]): string {
  return [
    `{bold}${t({ zh: "可用 City", en: "Available Cities" })}{/bold}`,
    "",
    ...servers.map((server) => [
      `${server.selected ? "*" : "-"} ${server.name}`,
      `  URL: ${server.base_url}`,
      `  source: ${server.source}`,
      `  session: ${server.has_user_session ? "yes" : "no"}`,
      `  admin: ${server.has_admin_secret_key ? "yes" : "no"}`,
    ].join("\n")),
  ].join("\n");
}

function format_login_detail(connection: TownCityConnectionState): string {
  return t({
    zh: [
      "{bold}登录{/bold}",
      `当前 City：${connection.city_url}`,
      "",
      "Enter 后选择可用登录方式。登录成功后，账号和余额会直接显示在这个 TUI 中。",
    ].join("\n"),
    en: [
      "{bold}Sign in{/bold}",
      `Current City: ${connection.city_url}`,
      "",
      "Press Enter to choose an available sign-in method. After sign-in, account and balance will appear in this TUI.",
    ].join("\n"),
  });
}

function format_balance_detail(account: TownCityBalanceAccount): string {
  return [
    `{bold}${t({ zh: "余额", en: "Balance" })}{/bold}`,
    `${account.balance} ${account.unit}`,
    "",
    `user: ${account.user_id}`,
    `created: ${account.created_at}`,
    `updated: ${account.updated_at}`,
  ].join("\n");
}

function format_current_user_detail(user: Awaited<ReturnType<CityUserManager["resolveCurrentUser"]>>): string {
  return [
    `{bold}${t({ zh: "当前账号", en: "Current account" })}{/bold}`,
    `URL: ${user.city_url}`,
    `town: ${user.town_id}`,
    `user: ${user.user_id || "unknown"}`,
    user.user_label ? `label: ${user.user_label}` : "",
    `source: ${user.source}`,
    `env url: ${user.env_overrides.city_url ? "yes" : "no"}`,
    `env town: ${user.env_overrides.town_id ? "yes" : "no"}`,
    `env token: ${user.env_overrides.user_token ? "yes" : "no"}`,
    user.warnings.length > 0 ? `\n${user.warnings.join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

function format_session_detail(session: {
  base_url: string;
  town_id: string;
  user_id?: string;
  user_label?: string;
  updated_at: string;
}): string {
  return [
    `{bold}${t({ zh: "登录成功", en: "Signed in" })}{/bold}`,
    `URL: ${session.base_url}`,
    `town: ${session.town_id}`,
    `user: ${session.user_id || "unknown"}`,
    session.user_label ? `label: ${session.user_label}` : "",
    `updated: ${session.updated_at}`,
  ].filter(Boolean).join("\n");
}

function format_recharge_result(result: TownCityRechargeResult): string {
  const checkout_url = typeof result.checkout.checkout_url === "string"
    ? result.checkout.checkout_url.trim()
    : "";
  return [
    `{bold}${t({ zh: "充值已创建", en: "Recharge created" })}{/bold}`,
    `amount: ${result.topup.amount} ${result.topup.unit}`,
    `status: ${result.topup.status}`,
    `topup: ${result.topup.topup_id}`,
    `method: ${result.method_id}`,
    result.checkout.payment_id ? `payment: ${result.checkout.payment_id}` : "",
    checkout_url ? `checkout: ${checkout_url}` : "",
    `browser: ${result.opened ? "opened" : "not opened"}`,
  ].filter(Boolean).join("\n");
}

function format_error_detail(title: string, message?: string): string {
  return [
    `{red-fg}{bold}${title}{/bold}{/red-fg}`,
    message || t({ zh: "未知错误", en: "Unknown error" }),
  ].join("\n");
}

function loading_text(message: string): string {
  return `{yellow-fg}${message}...{/yellow-fg}`;
}

function format_locale_description(cli_locale: "zh" | "en"): string {
  if (cli_locale === "zh") {
    return t({
      zh: "当前默认语言：中文",
      en: "Current default language: Chinese",
    });
  }

  return t({
    zh: "当前默认语言：英文",
    en: "Current default language: English",
  });
}

function section_item(id: string, title: string): tui_list_item {
  return {
    id: `section:${id}`,
    title,
    subtitle: "",
    detail: "",
    disabled: true,
  };
}

function find_action_index(items: tui_list_item[], action: city_manager_action): number {
  const index = items.findIndex((item) => item.id === action);
  return index >= 0 ? index : resolve_loop_selectable_index(items, 0, 0);
}

function is_disabled_item(item: tui_list_item | undefined): boolean {
  return is_disabled_selectable_item(item);
}
