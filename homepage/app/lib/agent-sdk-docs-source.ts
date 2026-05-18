import { loader } from "fumadocs-core/source";
import { agentSdkDocs } from "../../.source/server";
import { i18n } from "./i18n";

/**
 * Agent SDK 文档 source 装载模块。
 * 说明：
 * 1. `agent-sdk-docs` 与 `docs`、`devdocs`、`ui-sdk-docs` 平级存在，只承载 Agent SDK 相关文档。
 * 2. 这样可以把 Agent SDK 的接入、会话、服务与 API 说明从主用户文档中彻底拆开。
 */
export const agentSdkDocsSource = loader({
  baseUrl: "/agent-sdk-docs",
  source: agentSdkDocs.toFumadocsSource(),
  i18n,
});
