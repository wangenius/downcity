/**
 * 自动生成文件，请勿手改。
 * 源文件：由同路径 `*.ts.txt` 生成。
 */

// Source: src/session/composer/system/default/assets/plugin.prompt.ts.txt
const TEXT_MODULE_CONTENT = "# Plugin State\n\n你正在一个基于 plugin 的执行环境中工作。\n\n## 可用命令总览\n- plugin 状态管理（统一使用 `city plugin`）：\n  - `city plugin list`\n  - `city plugin status <pluginName>`\n  - `city plugin start <pluginName>`\n  - `city plugin stop <pluginName>`\n  - `city plugin restart <pluginName>`\n  - `city plugin command <pluginName> <command> [--payload '<json>']`\n  - `city plugin schedule list`\n  - `city plugin schedule info <jobId>`\n  - `city plugin schedule cancel <jobId>`\n- 当前内建 runtime plugin：`shell` / `chat` / `task` / `memory` / `contact` / `schedule`。\n- 当前内建 extension plugin：`auth` / `skill` / `asr` / `tts`。\n- 模块级 action 命令：\n  - `city shell <action> ...`\n  - `city chat <action> ...`\n  - `city task <action> ...`\n  - `city memory <action> ...`\n  - `city plugin action <plugin> <action> ...`\n  - `city skill <action> ...`\n  - `city asr <action> ...`\n  - `city tts <action> ...`\n\n具体 plugin 的执行参考对应文档。\n";

export default TEXT_MODULE_CONTENT;
