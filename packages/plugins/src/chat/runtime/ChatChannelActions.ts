/**
 * ChatChannelActions：chat 渠道 action 执行模块。
 *
 * 关键点（中文）
 * - status/test/reconnect/open/close/configuration/configure 的执行逻辑统一收敛在这里。
 * - 该模块复用 lifecycle/config 模块，不直接持有长期运行态。
 * - 对外只暴露 action 级入口，供 ChatPluginActions 装配使用。
 */

import type {
  AgentContext,
  DowncityChatChannelConfig,
  DowncityConfig,
} from "@downcity/agent";
import type { ChatChannelState } from "@/chat/types/ChatRuntime.js";
import { getStoredChannelAccountSync } from "@/chat/accounts/Store.js";
import type {
  ChatCloseActionPayload,
  ChatConfigurationActionPayload,
  ChatConfigureActionPayload,
  ChatOpenActionPayload,
  ChatReconnectActionPayload,
  ChatStatusActionPayload,
  ChatTestActionPayload,
} from "@/chat/types/ChatPluginActionPayload.js";
import type { ChatChannelTestResult } from "@/chat/types/ChannelStatus.js";
import type { ChatChannelName } from "@/chat/types/ChannelStatus.js";
import {
  describeChatChannelConfiguration,
  getChatChannelStatus,
  listChatChannelConfigurationDescriptions,
  normalizeChatChannelConfigPatch,
} from "./ChatChannelConfig.js";
import {
  type ChatRuntimeBindings,
  getChatChannelBot,
  resolveChatPluginBindings,
  resolveTargetChannels,
} from "./ChatChannelCore.js";
import {
  startSingleChatChannel,
  stopSingleChatChannel,
} from "./ChatChannelLifecycle.js";

type ChatRuntimeControlBindings = ChatRuntimeBindings & {
  applyChannelRuntimePatch: NonNullable<ChatRuntimeBindings["applyChannelRuntimePatch"]>;
};

function getChatRuntimeBindings(context: AgentContext): ChatRuntimeControlBindings {
  const plugin = resolveChatPluginBindings(context);
  if (!plugin?.applyChannelRuntimePatch) {
    throw new Error("ChatPlugin runtime instance is not available");
  }
  return plugin as ChatRuntimeControlBindings;
}

/**
 * 将 channel patch 合并进完整 plugins 配置并交给宿主持久化。
 *
 * 关键点（中文）
 * - 始终写回完整 plugins 对象，避免覆盖其他 plugin 配置。
 * - 宿主持久化成功后才更新当前 context 快照，保证运行态与存储态一致。
 */
async function persist_chat_channel_patches(params: {
  context: AgentContext;
  patches: Array<{
    channel: ChatChannelName;
    enabled?: boolean;
    channel_account_id?: string | null;
  }>;
}): Promise<DowncityConfig["plugins"]> {
  const current_plugins = params.context.config.plugins || {};
  const current_chat = current_plugins.chat || {};
  const next_channels = { ...(current_chat.channels || {}) };

  for (const patch of params.patches) {
    const current_channel = next_channels[patch.channel] || {};
    const next_channel: DowncityChatChannelConfig = { ...current_channel };
    if (typeof patch.enabled === "boolean") {
      next_channel.enabled = patch.enabled;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "channel_account_id")) {
      const channel_account_id = String(patch.channel_account_id || "").trim();
      if (channel_account_id) {
        next_channel.channelAccountId = channel_account_id;
      } else {
        delete next_channel.channelAccountId;
      }
    }
    next_channels[patch.channel] = next_channel;
  }

  const next_plugins: DowncityConfig["plugins"] = {
    ...current_plugins,
    chat: {
      ...current_chat,
      channels: next_channels,
    },
  };
  await params.context.pluginConfig.persistProjectPlugins(next_plugins);
  params.context.config.plugins = next_plugins;
  return next_plugins;
}

/**
 * 执行 `chat.status` action。
 */
export async function executeChatStatusAction(params: {
  state: ChatChannelState;
  context: AgentContext;
  payload: ChatStatusActionPayload;
}) {
  const channels = resolveTargetChannels(params.payload.channel);
  const items = channels.map((channel) =>
    getChatChannelStatus(params.state, params.context, channel),
  );
  return {
    success: true,
    data: {
      channels: items,
    },
  };
}

/**
 * 执行 `chat.test` action。
 */
export async function executeChatTestAction(params: {
  state: ChatChannelState;
  context: AgentContext;
  payload: ChatTestActionPayload;
}) {
  const channels = resolveTargetChannels(params.payload.channel);
  const results: ChatChannelTestResult[] = [];
  for (const channel of channels) {
    const snapshot = getChatChannelStatus(params.state, params.context, channel);
    if (!snapshot.enabled) {
      results.push({
        channel,
        success: false,
        testedAtMs: Date.now(),
        message: "Channel is disabled",
      });
      continue;
    }
    if (!snapshot.configured) {
      results.push({
        channel,
        success: false,
        testedAtMs: Date.now(),
        message: "Channel credentials are missing",
      });
      continue;
    }

    const bot = getChatChannelBot(params.state, channel);
    if (!bot) {
      results.push({
        channel,
        success: false,
        testedAtMs: Date.now(),
        message: "Channel is not running. Use reconnect first.",
      });
      continue;
    }
    results.push(await bot.testConnection());
  }

  return {
    success: true,
    data: {
      results,
      total: results.length,
      failed: results.filter((item) => !item.success).length,
    },
  };
}

/**
 * 执行 `chat.reconnect` action。
 */
export async function executeChatReconnectAction(params: {
  state: ChatChannelState;
  context: AgentContext;
  payload: ChatReconnectActionPayload;
}) {
  const targets = resolveTargetChannels(params.payload.channel);
  for (const channel of targets) {
    const snapshot = getChatChannelStatus(params.state, params.context, channel);
    if (!snapshot.enabled) {
      return {
        success: false,
        error: `Channel ${channel} is disabled`,
      };
    }
    if (!snapshot.configured) {
      return {
        success: false,
        error: `Channel ${channel} credentials are missing`,
      };
    }
  }

  for (const channel of targets) {
    await stopSingleChatChannel(params.state, channel);
  }
  for (const channel of targets) {
    await startSingleChatChannel(params.state, params.context, channel);
  }

  const channels = targets.map((channel) =>
    getChatChannelStatus(params.state, params.context, channel),
  );
  return {
    success: true,
    data: {
      channels,
    },
  };
}

/**
 * 执行 `chat.open` action。
 */
export async function executeChatOpenAction(params: {
  state: ChatChannelState;
  context: AgentContext;
  payload: ChatOpenActionPayload;
}) {
  const targets = resolveTargetChannels(params.payload.channel);
  const plugin = getChatRuntimeBindings(params.context);
  await persist_chat_channel_patches({
    context: params.context,
    patches: targets.map((channel) => ({ channel, enabled: true })),
  });
  for (const channel of targets) {
    plugin.applyChannelRuntimePatch({
      channel,
      enabled: true,
    });
  }

  for (const channel of targets) {
    const snapshot = getChatChannelStatus(params.state, params.context, channel);
    if (!snapshot.configured) continue;
    if (snapshot.running) continue;
    await startSingleChatChannel(params.state, params.context, channel);
  }

  const channels = targets.map((channel) =>
    getChatChannelStatus(params.state, params.context, channel),
  );
  return {
    success: true,
    data: {
      channels,
    },
  };
}

/**
 * 执行 `chat.close` action。
 */
export async function executeChatCloseAction(params: {
  state: ChatChannelState;
  context: AgentContext;
  payload: ChatCloseActionPayload;
}) {
  const targets = resolveTargetChannels(params.payload.channel);
  const plugin = getChatRuntimeBindings(params.context);
  await persist_chat_channel_patches({
    context: params.context,
    patches: targets.map((channel) => ({ channel, enabled: false })),
  });
  for (const channel of targets) {
    await stopSingleChatChannel(params.state, channel);
    plugin.applyChannelRuntimePatch({
      channel,
      enabled: false,
    });
  }

  const channels = targets.map((channel) =>
    getChatChannelStatus(params.state, params.context, channel),
  );
  return {
    success: true,
    data: {
      channels,
    },
  };
}

/**
 * 执行 `chat.configuration` action。
 */
export async function executeChatConfigurationAction(params: {
  context: AgentContext;
  payload: ChatConfigurationActionPayload;
}) {
  void params.context;
  const targets = resolveTargetChannels(params.payload.channel);
  const items = targets.map((channel) => ({
    channel,
    configuration: describeChatChannelConfiguration(channel),
  }));
  return {
    success: true,
    data: {
      channels: items,
      allChannels: listChatChannelConfigurationDescriptions(),
    },
  };
}

/**
 * 执行 `chat.configure` action。
 */
export async function executeChatConfigureAction(params: {
  state: ChatChannelState;
  context: AgentContext;
  payload: ChatConfigureActionPayload;
}) {
  const channel = params.payload.channel;
  const patch = normalizeChatChannelConfigPatch({
    channel,
    config: params.payload.config || {},
  });

  if (Object.keys(patch).length === 0) {
    return {
      success: false,
      error: "No valid config fields provided",
    };
  }

  if (Object.prototype.hasOwnProperty.call(patch, "channelAccountId")) {
    const channelAccountId = String(patch.channelAccountId || "").trim();
    if (channelAccountId) {
      const account = getStoredChannelAccountSync(channelAccountId);
      if (!account) {
        return {
          success: false,
          error: `Bot account not found: ${channelAccountId}`,
        };
      }
      if (account.channel !== channel) {
        return {
          success: false,
          error: `Bot account channel mismatch: expected ${channel}, got ${account.channel}`,
        };
      }
    }
  }

  const plugin = getChatRuntimeBindings(params.context);
  await persist_chat_channel_patches({
    context: params.context,
    patches: [{
      channel,
      ...(typeof patch.enabled === "boolean" ? { enabled: patch.enabled } : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, "channelAccountId")
        ? { channel_account_id: String(patch.channelAccountId || "").trim() || null }
        : {}),
    }],
  });
  plugin.applyChannelRuntimePatch({
    channel,
    ...(typeof patch.enabled === "boolean" ? { enabled: patch.enabled } : {}),
    ...(Object.prototype.hasOwnProperty.call(patch, "channelAccountId")
      ? { channelAccountId: String(patch.channelAccountId || "").trim() || null }
      : {}),
  });

  // 关键点（中文）：默认重载一次目标渠道，让新配置立刻生效。
  const restart = params.payload.restart !== false;
  if (restart) {
    await stopSingleChatChannel(params.state, channel);
    const snapshot = getChatChannelStatus(params.state, params.context, channel);
    if (snapshot.enabled && snapshot.configured) {
      await startSingleChatChannel(params.state, params.context, channel);
    }
  }

  return {
    success: true,
    data: {
      channel,
      restartApplied: restart,
      appliedKeys: Object.keys(patch),
      channels: [getChatChannelStatus(params.state, params.context, channel)],
    },
  };
}
