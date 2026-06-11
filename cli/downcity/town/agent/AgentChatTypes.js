/**
 * `town agent chat` CLI 类型。
 *
 * 关键点（中文）
 * - 统一覆盖交互式持续对话与一次性消息两种入口。
 * - 默认使用独立的 local-cli 会话，避免与控制面 UI 上下文互相污染。
 */
/**
 * `town agent chat` 默认使用的 local-cli 会话 ID。
 */
export const AGENT_CHAT_DEFAULT_SESSION_ID = "local-cli-chat-main";
/**
 * `town agent chat --new-session` 生成的 session ID 前缀。
 */
export const AGENT_CHAT_NEW_SESSION_ID_PREFIX = "local-cli-chat";
//# sourceMappingURL=AgentChatTypes.js.map