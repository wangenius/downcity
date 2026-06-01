import { loader } from "fumadocs-core/source";
import { uiSdkDocs } from "../../.source/server";
import { i18n } from "./i18n";

/**
 * UI SDK 文档 source 装载模块。
 * 说明：
 * 1. `ui-sdk-docs` 是独立文档系统，只承载 UI SDK 用户文档。
 * 2. 这样可以把 UI 组件文档从主文档中明确分开，避免导航层级混杂。
 */
export const uiSdkDocsSource = loader({
  baseUrl: "/ui-sdk-docs",
  source: uiSdkDocs.toFumadocsSource(),
  i18n,
});
