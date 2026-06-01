import { loader } from "fumadocs-core/source";
import { citySdkDocs } from "../../.source/server";
import { i18n } from "./i18n";

/**
 * 共享服务 SDK 文档 source 装载模块。
 * 说明：
 * 1. `city-sdk-docs` 独立承载 `@downcity/city`、`City`、`CityBase` 与共享服务部署文档。
 * 2. 具体 services 能力迁移到 `services-sdk-docs`，这里只保留共享服务运行时与服务装配边界。
 */
export const citySdkDocsSource = loader({
  baseUrl: "/city-sdk-docs",
  source: citySdkDocs.toFumadocsSource(),
  i18n,
});
