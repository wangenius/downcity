/**
 * contact service system prompt 提供器。
 *
 * 关键点（中文）
 * - session system composer 通过静态 provider 清单读取 service system。
 * - contact prompt 在这里统一暴露，避免 service 实例和 system 域产生耦合。
 */
import { CONTACT_SERVICE_PROMPT } from "@/service/builtins/contact/runtime/ContactPromptAssets.js";

/**
 * 构建 contact service system 文本。
 */
export function buildContactServiceSystemText(): string {
  return CONTACT_SERVICE_PROMPT;
}
