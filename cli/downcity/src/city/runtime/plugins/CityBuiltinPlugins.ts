/**
 * CityBuiltinPlugins：City 宿主侧内建 plugin 装配。
 *
 * 关键点（中文）
 * - City 运行期直接 new 每个 plugin，所有 constructor 参数都由 City 宿主层注入。
 * - `@downcity/plugins` 只提供 plugin class，不参与 City 全局账号、City 登录态或运行配置解析。
 * - 静态 CLI catalog 使用同一套 City 装配入口，但不注入需要 City 登录态的 image/asr/tts。
 */

import type { BasePlugin } from "@downcity/agent/internal/plugin/core/BasePlugin.js";
import type { StoredChannelAccount } from "@downcity/agent";
import {
  AsrPlugin,
  ChatPlugin,
  ContactPlugin,
  FeishuChannel,
  ImagePlugin,
  MemoryPlugin,
  QqChannel,
  SkillPlugin,
  TaskPlugin,
  TelegramChannel,
  TtsPlugin,
  WebPlugin,
  WorkboardPlugin,
} from "@downcity/plugins";
import type { ImagePluginInput } from "@downcity/plugins";
import type { AsrPluginInput } from "@downcity/plugins";
import type { TtsPluginInput } from "@downcity/plugins";
import { CityUserManager } from "@/city/shared/CityUserManager.js";
import { PlatformStore } from "@/city/runtime/store/index.js";

const city_user_manager = new CityUserManager();

type ChatChannelAccountName = "telegram" | "feishu" | "qq";

/**
 * 判断 chat account 是否具备对应渠道的完整凭据。
 */
function isConfiguredChatAccount(account: StoredChannelAccount): boolean {
  if (account.channel === "telegram") {
    return !!String(account.botToken || "").trim();
  }
  return !!String(account.appId || "").trim() &&
    !!String(account.appSecret || "").trim();
}

/**
 * 选出某个平台当前应注入给 agent 的 City 全局账号。
 *
 * 关键点（中文）：City 级账号没有项目内配置时，按 updatedAt 最新的完整账号作为默认运行绑定。
 */
function pickChannelAccount(
  accounts: StoredChannelAccount[],
  channel: ChatChannelAccountName,
): StoredChannelAccount | null {
  const candidates = accounts
    .filter((account) => account.channel === channel)
    .filter(isConfiguredChatAccount)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return candidates[0] || null;
}

/**
 * 读取 City 全局 chat accounts。
 */
function listCityChannelAccounts(): StoredChannelAccount[] {
  const store = new PlatformStore();
  try {
    return store.listChannelAccountsSync();
  } finally {
    store.close();
  }
}

/**
 * 创建 City 注入给 ChatPlugin 的 channel 实例。
 */
function createCityChatChannels(params: {
  /**
   * 是否读取 City 全局账号池。
   */
  includeAccounts: boolean;
}) {
  const accounts = params.includeAccounts ? listCityChannelAccounts() : [];
  const telegram = pickChannelAccount(accounts, "telegram");
  const feishu = pickChannelAccount(accounts, "feishu");
  const qq = pickChannelAccount(accounts, "qq");

  return [
    new TelegramChannel({
      enabled: Boolean(telegram),
      channelAccountId: telegram?.id,
      name: telegram?.name,
    }),
    new FeishuChannel({
      enabled: Boolean(feishu),
      channelAccountId: feishu?.id,
      name: feishu?.name,
    }),
    new QqChannel({
      enabled: Boolean(qq),
      channelAccountId: qq?.id,
      name: qq?.name,
    }),
  ];
}

/**
 * 创建不依赖 City 登录态的 City 内建 plugin 集合。
 *
 * 关键点（中文）：该集合用于 CLI catalog 与 agent runtime 的公共基础部分，保持所有 plugin 都走 constructor。
 */
export function createCityStaticBuiltinPlugins(input: {
  /**
   * 是否读取 City 全局 chat accounts 并注入 chat channels。
   */
  includeChatAccounts?: boolean;
} = {}): BasePlugin[] {
  return [
    new SkillPlugin(),
    new WebPlugin(),
    new WorkboardPlugin(),
    new ChatPlugin({
      channels: createCityChatChannels({
        includeAccounts: input.includeChatAccounts === true,
      }),
    }),
    new ContactPlugin(),
    new TaskPlugin(),
    new MemoryPlugin(),
  ];
}

/**
 * 创建 City agent 运行期应启用的完整内建 plugin 集合。
 */
export async function createCityBuiltinPlugins(input: {
  /**
   * 宿主显式注入的 env，用于支持 DOWNCITY_CITY_* 覆盖项。
   */
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
} = {}): Promise<BasePlugin[]> {
  const { client } = await city_user_manager.createUserClient({
    env: input.env ?? process.env,
  });

  return [
    ...createCityStaticBuiltinPlugins({
      includeChatAccounts: true,
    }),
    new ImagePlugin({
      image_create: async (image_input: ImagePluginInput) =>
        await client.ai.image_create(image_input),
      image_result: async (image_input) =>
        await client.ai.image_result(image_input),
    }),
    new AsrPlugin({
      asr: async (asr_input: AsrPluginInput) =>
        await client.ai.asr(asr_input),
    }),
    new TtsPlugin({
      tts: async (tts_input: TtsPluginInput) =>
        await client.ai.tts(tts_input),
    }),
  ];
}
