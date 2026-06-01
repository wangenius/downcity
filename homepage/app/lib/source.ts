import { loader } from "fumadocs-core/source";
import { docs } from "../../.source/server";
import { i18n } from "./i18n";

/**
 * Downcity Docs source 装载模块。
 * 说明：
 * 1. 主 `docs` 现在定位为文档地图和产品级导览，不再承载全部 SDK 细节。
 * 2. Products、City SDK、Agent SDK、Services SDK、Plugins 和 UI SDK 都拆成独立文档 space。
 */
export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  i18n,
});
