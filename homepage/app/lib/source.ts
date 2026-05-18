import { loader } from "fumadocs-core/source";
import { docs } from "../../.source/server";
import { i18n } from "./i18n";

/**
 * City Docs source 装载模块。
 * 说明：
 * 1. 主 `docs` 现在定位为 City Docs，聚焦控制平面、CLI、配置与运行逻辑。
 * 2. SDK、Plugin 与内建能力细节单独收敛到 `agent-sdk-docs`。
 */
export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  i18n,
});
