/**
 * 自动生成文件，请勿手改。
 * 源文件：由同路径 `*.ts.txt` 生成。
 */

// Source: src/executor/composer/system/default/assets/plugin.prompt.ts.txt
const TEXT_MODULE_CONTENT = "# Plugin State\n\n你正在一个基于 plugin 的执行环境中工作。\n\n## 可用命令总览\n- plugin 状态管理（统一使用 `studio plugin`）：\n  - `studio plugin list`\n  - `studio plugin status <pluginName>`\n  - `studio plugin start <pluginName>`\n  - `studio plugin stop <pluginName>`\n  - `studio plugin restart <pluginName>`\n  - `studio plugin command <pluginName> <command> [--payload '<json>']`\n  - `studio plugin schedule list`\n  - `studio plugin schedule info <jobId>`\n  - `studio plugin schedule cancel <jobId>`\n- ActionSchedule 管理命令用于查看/取消延迟执行的 plugin action，不是独立 plugin。\n- 当前内建托管 plugin：`shell` / `chat` / `task` / `memory` / `contact`。\n- 当前内建本地 plugin：`auth` / `skill` / `asr` / `tts`。\n- 模块级 action 命令：\n  - `studio shell <action> ...`\n  - `studio chat <action> ...`\n  - `studio task <action> ...`\n  - `studio memory <action> ...`\n  - `studio plugin action <plugin> <action> ...`\n  - `studio skill <action> ...`\n  - `studio asr <action> ...`\n  - `studio tts <action> ...`\n\n具体 plugin 的执行参考对应文档。\n";

export default TEXT_MODULE_CONTENT;
