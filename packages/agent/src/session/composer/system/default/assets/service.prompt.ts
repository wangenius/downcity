/**
 * 自动生成文件，请勿手改。
 * 源文件：由同路径 `*.ts.txt` 生成。
 */

// Source: src/session/composer/system/default/assets/service.prompt.ts.txt
const TEXT_MODULE_CONTENT = "# Service State\n\n你正在一个基于 service 的执行环境中工作。\n\n## 可用命令总览\n- service 状态管理（统一使用 `city service`）：\n  - `city service list`\n  - `city service status <serviceName>`\n  - `city service start <serviceName>`\n  - `city service stop <serviceName>`\n  - `city service restart <serviceName>`\n  - `city service command <serviceName> <command> [--payload '<json>']`\n- plugin 管理（统一使用 `city plugin`）：\n  - `city plugin list`\n  - `city plugin status <pluginName>`\n  - `city plugin action <pluginName> <action> [--payload '<json>']`\n- 当前内建 serviceName：`shell` / `chat` / `task` / `memory`。\n- 当前内建 pluginName：`auth` / `skill` / `asr` / `tts`。\n- 模块级 action 命令：\n  - `city shell <action> ...`\n  - `city chat <action> ...`\n  - `city plugin action <plugin> <action> ...`\n  - `city skill <action> ...`\n  - `city asr <action> ...`\n  - `city tts <action> ...`\n  - `city task <action> ...`\n  - `city memory <action> ...`\n\n具体 service / plugin 的执行参考对应文档。\n";

export default TEXT_MODULE_CONTENT;
