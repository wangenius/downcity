/**
 * contact service system prompt 提供器。
 *
 * 关键点（中文）
 * - session system composer 通过静态 provider 清单读取 service system。
 * - contact prompt 在这里统一读取，避免 service 实例和 system 域产生耦合。
 */

import { readFileSync } from "node:fs";

const CONTACT_PROMPT_FILE_URL = new URL("../PROMPT.txt", import.meta.url);

/**
 * 构建 contact service system 文本。
 */
export function buildContactServiceSystemText(): string {
  try {
    return readFileSync(CONTACT_PROMPT_FILE_URL, "utf-8").trim();
  } catch {
    return "";
  }
}
