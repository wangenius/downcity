import { loader } from "fumadocs-core/source";
import { citySdkDocs } from "../../.source/server";
import { i18n } from "./i18n";

/**
 * City SDK 文档 source 装载模块。
 * 说明：
 * 1. `city-sdk-docs` 独立承载 `@downcity/city`、`City`、`CityBase` 与 City 部署文档。
 * 2. 具体 payments 能力迁移到 `payments`，这里只保留 City runtime 与 Service 装配边界。
 */
export const citySdkDocsSource = loader({
  baseUrl: "/city-sdk-docs",
  source: citySdkDocs.toFumadocsSource(),
  i18n,
});
