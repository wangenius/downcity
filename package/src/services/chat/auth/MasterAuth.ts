/**
 * Chat 主人（master）鉴权模块。
 *
 * 关键点（中文）
 * - 从 `services.chat.channels.<channel>.auth_id` + 环境变量解析主人鉴权 ID。
 * - 渠道无关：Telegram/Feishu/QQ 共用同一判定逻辑。
 * - 判定结果分为 `master | guest | unknown`，供 `<info>` 与策略提示使用。
 */

import type { ShipConfig } from "@main/types/ShipConfig.js";
import type { ChatDispatchChannel } from "@services/chat/types/ChatDispatcher.js";
import type {
  ChatMasterMatchParams,
  ChatMasterStatus,
  ChatMasterAuthIdMap,
} from "@services/chat/types/ChatAuth.js";

type MasterIdMap = Record<ChatDispatchChannel, string | undefined>;

const MASTER_ENV_KEY_BY_CHANNEL: Record<ChatDispatchChannel, string> = {
  telegram: "TELEGRAM_AUTH_ID",
  feishu: "FEISHU_AUTH_ID",
  qq: "QQ_AUTH_ID",
};

/**
 * 解析并标准化用户 ID。
 */
function normalizeUserId(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  // 关键点（中文）：init 模板值 `${...}` 不应参与真实鉴权。
  if (/^\$\{[^}]+\}$/.test(text)) return undefined;
  return text;
}

/**
 * 读取单值鉴权 ID。
 */
function parseAuthId(raw: unknown): string | undefined {
  return normalizeUserId(raw);
}

function readConfigMasterMap(config?: ShipConfig): ChatMasterAuthIdMap {
  const channels = config?.services?.chat?.channels;
  return {
    telegram: parseAuthId(channels?.telegram?.auth_id),
    feishu: parseAuthId(channels?.feishu?.auth_id),
    qq: parseAuthId(channels?.qq?.auth_id),
  };
}

function readEnvAuthId(channel: ChatDispatchChannel): string | undefined {
  return parseAuthId(process.env[MASTER_ENV_KEY_BY_CHANNEL[channel]]);
}

function buildMasterId(params: {
  channel: ChatDispatchChannel;
  configMap: ChatMasterAuthIdMap;
}): string | undefined {
  const configAuthId = parseAuthId(params.configMap[params.channel]);
  const envAuthId = readEnvAuthId(params.channel);
  // 关键点（中文）：优先使用 ship.json 的 auth_id；未配置时回退到环境变量。
  return configAuthId || envAuthId;
}

/**
 * Chat master 判定器。
 */
export type ChatMasterAuthResolver = {
  /**
   * 判定用户是否为主人。
   *
   * 返回值（中文）
   * - `true`: 明确是主人
   * - `false`: 明确不是主人
   * - `undefined`: 无法判定（unknown）
   */
  isMaster(params: ChatMasterMatchParams): boolean | undefined;
  /**
   * 返回三态判定（master/guest/unknown）。
   */
  resolveStatus(params: ChatMasterMatchParams): ChatMasterStatus;
};

/**
 * 创建 Chat master 判定器。
 */
export function createChatMasterAuthResolver(
  config?: ShipConfig,
): ChatMasterAuthResolver {
  const configMap = readConfigMasterMap(config);
  const masterIdByChannel: MasterIdMap = {
    telegram: buildMasterId({ channel: "telegram", configMap }),
    feishu: buildMasterId({ channel: "feishu", configMap }),
    qq: buildMasterId({ channel: "qq", configMap }),
  };

  const resolveStatus = (params: ChatMasterMatchParams): ChatMasterStatus => {
    const userId = normalizeUserId(params.userId);
    if (!userId) return "unknown";
    const authId = masterIdByChannel[params.channel];
    if (!authId) return "unknown";
    return userId === authId ? "master" : "guest";
  };

  return {
    isMaster(params) {
      const status = resolveStatus(params);
      if (status === "master") return true;
      if (status === "guest") return false;
      return undefined;
    },
    resolveStatus,
  };
}
