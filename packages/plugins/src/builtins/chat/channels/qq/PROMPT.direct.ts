/**
 * 自动生成文件，请勿手改。
 * 源文件：由同路径 `*.ts.txt` 生成。
 */

// Source: src/plugin/builtins/chat/channels/qq/PROMPT.direct.ts.txt
const TEXT_MODULE_CONTENT = "# QQ Adapter 使用说明（direct 模式）\n\n## 能力范围\n- 负责 QQ 官方机器人网关（WebSocket）消息接入与发送。\n- 入站消息会由 chat plugin runtime 映射到内部 `sessionId`（随机分配并持久化）。\n\n## 使用约束\n- 在 direct 模式下，你输出的 assistant 文本会自动发送到当前 QQ 会话。\n- QQ 出站回复依赖入站消息上下文（如 `chatType` 与 `messageId`）；跨会话发送请使用 `city chat send --chat-key ...`，不要在 direct metadata 中写 `chatKey`。\n- 群聊消息默认全量接入，不需要 `@` 触发。\n- 适配器会过滤机器人自回环消息并做入站去重，避免“自己回复自己”的循环。\n";

export default TEXT_MODULE_CONTENT;
