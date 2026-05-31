/**
 * 自动生成文件，请勿手改。
 * 源文件：由同路径 `*.ts.txt` 生成。
 */

// Source: src/executor/composer/system/default/assets/plugin.prompt.ts.txt
const TEXT_MODULE_CONTENT = "# Plugin State\n\n你正在一个基于 plugin 的执行环境中工作。\n\n## 可用命令总览\n- plugin 状态管理（统一使用 `bay plugin`）：\n  - `bay plugin list`\n  - `bay plugin status <pluginName>`\n  - `bay plugin start <pluginName>`\n  - `bay plugin stop <pluginName>`\n  - `bay plugin restart <pluginName>`\n  - `bay plugin command <pluginName> <command> [--payload '<json>']`\n  - `bay plugin schedule list`\n  - `bay plugin schedule info <jobId>`\n  - `bay plugin schedule cancel <jobId>`\n- ActionSchedule 管理命令用于查看/取消延迟执行的 plugin action，不是独立 plugin。\n- 当前内建托管 plugin：`shell` / `chat` / `task` / `memory` / `contact`。\n- 当前内建本地 plugin：`auth` / `skill` / `asr` / `tts`。\n- 模块级 action 命令：\n  - `bay shell <action> ...`\n  - `bay chat <action> ...`\n  - `bay task <action> ...`\n  - `bay memory <action> ...`\n  - `bay plugin action <plugin> <action> ...`\n  - `bay skill <action> ...`\n  - `bay asr <action> ...`\n  - `bay tts <action> ...`\n\n具体 plugin 的执行参考对应文档。\n";

export default TEXT_MODULE_CONTENT;
