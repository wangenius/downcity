import { loader } from "fumadocs-core/source";
import { payments } from "../../.source/server";
import { i18n } from "./i18n";

/**
 * Payments 文档 source 装载模块。
 * 说明：
 * 1. `payments` 独立承载 `@downcity/services` 的 accounts、balance、usage 与 payment-stripe 文档。
 * 2. 它和 plugins docs 一样是能力包手册，不再嵌在City SDK 的包目录下面。
 */
export const paymentsSource = loader({
  baseUrl: "/payments",
  source: payments.toFumadocsSource(),
  i18n,
});
