/**
 * ChatChannelActions：chat 渠道 action 执行模块。
 *
 * 关键点（中文）
 * - status/test/reconnect/open/close/configuration/configure 的执行逻辑统一收敛在这里。
 * - 该模块复用 lifecycle/config 模块，不直接持有长期运行态。
 * - 对外只暴露 action 级入口，供 ChatServiceActions 装配使用。
 */

import { ConsoleStore } from "@/shared/utils/store/index.js";
import type { ExecutionContext } from "@/shared/types/ExecutionContext.js";
import type { ChatChannelState } from "@/shared/types/ChatRuntime.js";
import type {
  ChatCloseActionPayload,
  ChatConfigurationActionPayload,
  ChatConfigureActionPayload,
  ChatOpenActionPayload,
  ChatReconnectActionPayload,
  ChatStatusActionPayload,
  ChatTestActionPayload,
} from "@/shared/types/ChatService.js";
import type { ChatChannelTestResult } from "@services/chat/types/ChannelStatus.js";
import {
  describeChatChannelConfiguration,
  getChatChannelStatus,
  listChatChannelConfigurationDescriptions,
  normalizeChatChannelConfigPatch,
  setChatChannelConfig,
  setChatChannelEnabled,
} from "./ChatChannelConfig.js";
import {
  getChatChannelBot,
  resolveTargetChannels,
} from "./ChatChannelCore.js";
import {
  startSingleChatChannel,
  stopSingleChatChannel,
} from "./ChatChannelLifecycle.js";

/**
 * 执行 `chat.status` action。
 */
export async function executeChatStatusAction(params: {
  state: ChatChannelState;
  context: ExecutionContext;
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
  context: ExecutionContext;
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
  context: ExecutionContext;
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
  context: ExecutionContext;
  payload: ChatOpenActionPayload;
}) {
  const targets = resolveTargetChannels(params.payload.channel);
  for (const channel of targets) {
    await setChatChannelEnabled({
      context: params.context,
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
  context: ExecutionContext;
  payload: ChatCloseActionPayload;
}) {
  const targets = resolveTargetChannels(params.payload.channel);
  for (const channel of targets) {
    await stopSingleChatChannel(params.state, channel);
    await setChatChannelEnabled({
      context: params.context,
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
  context: ExecutionContext;
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
  context: ExecutionContext;
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
      const store = new ConsoleStore();
      try {
        const account = store.getChannelAccountSync(channelAccountId);
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
      } finally {
        store.close();
      }
    }
  }

  await setChatChannelConfig({
    context: params.context,
    channel,
    patch,
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
