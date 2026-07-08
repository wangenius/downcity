/**
 * 自动生成文件，请勿手改。
 * 源文件：由同路径 `*.ts.txt` 生成。
 */

// Source: src/executor/composer/system/default/assets/plugin.prompt.ts.txt
const TEXT_MODULE_CONTENT = "# Plugin State\n\nYou are working in a plugin-based execution environment.\n\n## Plugin Call Rules\n\n- When you need plugin capabilities, prefer invoking the plugin action through the available tools.\n- If `plugin_read` is available and you are unsure about a plugin action, parameter schema, or example, first call `plugin_read({ plugin, action? })` to read metadata.\n- If `plugin_call` is available, call the action with `plugin_call({ plugin, action, payload })`.\n- `plugin_call.plugin` is the plugin name, for example `skill`, `task`, `memory`, or `contact`.\n- `plugin_call.action` is the action name, for example `list`, `lookup`, `create`, or `run`.\n- `plugin_call.payload` is a structured JSON payload. Pass `{}` when there are no parameters. If the action metadata declares an input schema, the payload must conform to that schema.\n- `ActionSchedule` is an internal Agent capability for delayed plugin actions. It is not a standalone plugin.\n\n## Available Plugin Overview\n\n- Current built-in managed plugins: `shell` / `chat` / `task` / `memory` / `contact`.\n- Current built-in local plugins: `auth` / `skill`.\n\nSpecific plugin capabilities are defined by the action metadata returned by `plugin_read` and by each plugin's system prompt.\n";

export default TEXT_MODULE_CONTENT;
