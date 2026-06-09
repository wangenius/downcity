/**
 * 自动生成文件，请勿手改。
 * 源文件：由同路径 `*.ts.txt` 生成。
 */

// Source: src/skill/PROMPT.ts.txt
const TEXT_MODULE_CONTENT = "# Skill Plugin\n\nskill 是你拥有的技能。用户的提出的需求和任务，你都需要先考虑利用相关的skill来高质量的完成。\n\n\n## 使用\n\n使用技能时需要首先通过 `skill` plugin 的 `lookup` action 载入对应的技能内容。\n\n如果当前工具集中存在 `plugin_call`，使用：\n\n```ts\nplugin_call({\n  plugin: \"skill\",\n  action: \"lookup\",\n  payload: {\n    name: \"<skill-name>\",\n  },\n});\n```\n\n可用 action 包括 `list`、`find`、`install`、`lookup`。\n";

export default TEXT_MODULE_CONTENT;
