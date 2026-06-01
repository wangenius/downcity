import { loader } from "fumadocs-core/source";
import { servicesSdkDocs } from "../../.source/server";
import { i18n } from "./i18n";

/**
 * Services SDK Docs 文档 source 装载模块。
 * 说明：
 * 1. `services-sdk-docs` 独立承载 `@downcity/services` 的 accounts、balance、usage 与 payment-stripe 文档。
 * 2. 它和 plugins docs 一样是能力包手册，不再嵌在 City SDK 的包目录下面。
 */
export const servicesSdkDocsSource = loader({
  baseUrl: "/services-sdk-docs",
  source: servicesSdkDocs.toFumadocsSource(),
  i18n,
});
