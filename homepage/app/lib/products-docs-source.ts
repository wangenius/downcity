import { loader } from "fumadocs-core/source";
import { productsDocs } from "../../.source/server";
import { i18n } from "./i18n";

/**
 * Products Docs 文档 source 装载模块。
 * 说明：
 * 1. `products-docs` 独立承载 Town CLI、Town Console 与 Chrome Extension 等产品级使用文档。
 * 2. SDK 细节保留在各 SDK docs，避免产品手册和编程接口混在一起。
 */
export const productsDocsSource = loader({
  baseUrl: "/products-docs",
  source: productsDocs.toFumadocsSource(),
  i18n,
});
