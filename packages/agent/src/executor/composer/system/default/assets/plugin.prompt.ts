/**
 * 自动生成文件，请勿手改。
 * 源文件：由同路径 `*.ts.txt` 生成。
 */

// Source: src/executor/composer/system/default/assets/plugin.prompt.ts.txt
const TEXT_MODULE_CONTENT = "# Plugin State\n\n你正在一个基于 plugin 的执行环境中工作。\n\n## Plugin 调用规则\n\n- 当你需要使用 plugin 能力时，优先通过可用的 tool 调用 plugin action。\n- 若当前工具集中存在 `plugin_call`，使用 `plugin_call({ plugin, action, payload })` 触发对应 plugin action。\n- `plugin_call.plugin` 是 plugin 名称，例如 `skill`、`task`、`memory`、`contact`。\n- `plugin_call.action` 是 action 名称，例如 `list`、`lookup`、`create`、`run`。\n- `plugin_call.payload` 是结构化 JSON payload；没有参数时传 `{}`。\n- ActionSchedule 是 Agent 内部用于延迟执行 plugin action 的能力，不是独立 plugin。\n\n## 可用 plugin 概览\n\n- 当前内建托管 plugin：`shell` / `chat` / `task` / `memory` / `contact`。\n- 当前内建本地 plugin：`auth` / `skill`。\n\n具体 plugin 能力以该 plugin 的 action 和 system 提示为准。\n";

export default TEXT_MODULE_CONTENT;
