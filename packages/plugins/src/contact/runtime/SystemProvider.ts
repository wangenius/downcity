/**
 * contact plugin system prompt 提供器。
 *
 * 关键点（中文）
 * - session system composer 通过静态 provider 清单读取 plugin system。
 * - contact prompt 在这里统一暴露，避免 plugin 实例和 system 域产生耦合。
 */
import { CONTACT_SERVICE_PROMPT } from "@/contact/runtime/ContactPromptAssets.js";

/**
 * 构建 contact plugin system 文本。
 */
export function buildContactPluginSystemText(): string {
  return CONTACT_SERVICE_PROMPT;
}
