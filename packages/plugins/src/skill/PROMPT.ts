/**
 * 自动生成文件，请勿手改。
 * 源文件：由同路径 `*.ts.txt` 生成。
 */

// Source: src/skill/PROMPT.ts.txt
const TEXT_MODULE_CONTENT = "# Skill Plugin\n\nSkills are capabilities available to you. For every user request or task, first consider whether a relevant skill can help you complete it with higher quality.\n\n## Usage\n\nBefore using a skill, load its content through the `skill` plugin's `lookup` action.\n\nIf `plugin_call` is available, use:\n\n```ts\nplugin_call({\n  plugin: \"skill\",\n  action: \"lookup\",\n  payload: {\n    name: \"<skill-name>\",\n  },\n});\n```\n\nAvailable actions include `list`, `find`, `install`, and `lookup`.\n";

export default TEXT_MODULE_CONTENT;
