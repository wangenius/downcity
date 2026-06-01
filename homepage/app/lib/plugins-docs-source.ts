import { loader } from "fumadocs-core/source";
import { pluginsDocs } from "../../.source/server";
import { i18n } from "./i18n";

/**
 * Agent Plugins Docs 文档 source 装载模块。
 * 说明：
 * 1. `plugins-docs` 与 `agent-sdk-docs` 平级存在，单独承载具体 built-in plugin 与场景示例文档。
 * 2. Agent SDK 只保留 plugin 概念层；这里承载具体 plugin 手册。
 */
export const pluginsDocsSource = loader({
  baseUrl: "/plugins-docs",
  source: pluginsDocs.toFumadocsSource(),
  i18n,
});
