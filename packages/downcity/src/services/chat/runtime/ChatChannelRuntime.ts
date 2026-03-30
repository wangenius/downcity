/**
 * ChatChannelRuntime：chat 渠道运行态门面模块。
 *
 * 关键点（中文）
 * - 对外继续保持原有导出入口不变。
 * - 内部实现已经拆为 core / lifecycle / config / actions 四层。
 * - 这样可以在不影响 ChatService 与 action 调用方的前提下，持续收敛复杂度。
 */

export {
  createChatChannelState,
  resolveChatChannelNameOrThrow,
} from "./ChatChannelCore.js";
export { startChatChannels, stopChatChannels } from "./ChatChannelLifecycle.js";
export {
  executeChatStatusAction,
  executeChatTestAction,
  executeChatReconnectAction,
  executeChatOpenAction,
  executeChatCloseAction,
  executeChatConfigurationAction,
  executeChatConfigureAction,
} from "./ChatChannelActions.js";
