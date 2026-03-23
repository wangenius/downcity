import { loader } from "fumadocs-core/source";
import { devdocs } from "../../.source/server";
import { i18n } from "./i18n";

/**
 * 开发者文档 source 装载模块。
 * 说明：
 * 1. `docs` 仅保留用户向说明；`devdocs` 单独承接架构、实现与设计规范。
 * 2. 这里与用户文档并行维护，避免两类受众混在同一棵树里。
 */
export const devSource = loader({
  baseUrl: "/devdocs",
  source: devdocs.toFumadocsSource(),
  i18n,
});
