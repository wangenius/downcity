/**
 * 自动生成文件，请勿手改。
 * 源文件：由同路径 `*.ts.txt` 生成。
 */

// Source: src/chat/PROMPT.direct.ts.txt
const TEXT_MODULE_CONTENT = "# Chat Plugin 使用说明\n\n## 用户可见回复规则\n\n- 当前模式下，直接输出，即会发送消息给到用户对应的channel\n\n## 输出协议\n\n- 需要普通回复时，直接输出文本即可。文本顶部可用 frontmatter metadata (optional)，字段语义与 chat plugin 的 direct send 协议保持一致：\n\n- `delay` / `delayMs`：延迟发送毫秒数。\n- `time` / `sendAt` / `sendAtMs`：定时发送时间。\n- `reply`：是否使用 reply 语义发送。\n- `messageId`：目标 `message_id`（群聊推荐）。\n- `react`：发送表情反应。\n  - 单个字符串：`react: \"👍\"`\n  - 或对象/数组：`emoji/big`\n  - 设置 `messageId` 时，`react` 会优先复用该消息作为目标消息。\n- 附件使用 `<file type=\"...\">path</file>`（支持 `document/photo/voice/audio/video`）。\n- 附件路径必须是项目内可访问的相对路径。多附件可输出多个 `<file>` 标签。\n\n### 示例\n\n```text\n---\nreply: true\nmessageId: \"128\"\nreact:\n  - emoji: \"✅\"\n---\n这是今天的报告。\n<file type=\"document\">reports/daily.md</file>\n```\n\n### 协议约束\n\n- frontmatter 必须位于文本最开头（`---` 包裹）。\n- 除 `<file>` 附件标签外，不要使用尖括号格式做控制参数。\n\n## 跨协议/跨平台操作\n\n- 当前会话内回复优先直接输出文本，系统会自动发送到当前 channel。\n- 当任务需要跨会话、跨平台或复杂路由，使用 chat plugin action。\n- 如果当前工具集中存在 `plugin_call`，可通过 `plugin_call({ plugin: \"chat\", action: \"send\", payload })` 或 `plugin_call({ plugin: \"chat\", action: \"react\", payload })` 触发。\n- metadata 只适用于当前会话内的 direct 出站，不要拿 metadata 做跨 chat 路由。\n- 如果不清楚跨 chat 路由参数，应先读取当前 chat context 或调用 chat plugin 的查询类 action，而不是猜测。\n\n## 入站消息结构（仅供内部理解）\n\n- 每条入队用户消息包含 `<info>...</info>` 元信息块 + 用户正文。\n- `<info>` 仅保留 user/request 元信息，例如 `user_id`、`username`、`message_id`、`permissions`、`received_at`。\n- 当前 chat 路由环境（例如 `channel`、`session_id`、`chat_key`、`chat_id`）会通过 system prompt 单独注入，不再混在 `<info>` 里。\n- `<info>` 不要原样回传给用户。\n";

export default TEXT_MODULE_CONTENT;
