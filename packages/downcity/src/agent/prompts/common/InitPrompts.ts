/**
 * InitPrompts：`city agent create` 默认 prompt 资产加载器。
 *
 * 职责说明（中文）
 * - 统一管理 create 生成的 `PROFILE.md` / `SOUL.md` / `USER.md` 默认内容。
 * - 资源集中在 `prompts/common/assets/init/*.txt`，避免散落在 constants。
 */

import { readFileSync } from "node:fs";

const PROFILE_TEMPLATE_FILE_URL = new URL(
  "./assets/init/PROFILE.md.txt",
  import.meta.url,
);
const SOUL_TEMPLATE_FILE_URL = new URL(
  "./assets/init/SOUL.md.txt",
  import.meta.url,
);
const USER_TEMPLATE_FILE_URL = new URL(
  "./assets/init/USER.md.txt",
  import.meta.url,
);

/**
 * 从 txt 资源加载 init 模板。
 *
 * 关键点（中文）
 * - 读取失败直接抛错，避免静默降级为空模板。
 * - `trimEnd` 仅去掉文件尾部空白，保留模板主体格式。
 */
function loadInitTemplate(fileUrl: URL, label: string): string {
  try {
    return readFileSync(fileUrl, "utf-8").trimEnd();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `failed to load init template ${label} from ${fileUrl.pathname}: ${reason}`,
    );
  }
}

/**
 * `PROFILE.md` 默认模板。
 */
export const DEFAULT_PROFILE_MD_TEMPLATE = loadInitTemplate(
  PROFILE_TEMPLATE_FILE_URL,
  "PROFILE.md",
);

/**
 * `SOUL.md` 默认模板。
 */
export const DEFAULT_SOUL_MD_TEMPLATE = loadInitTemplate(
  SOUL_TEMPLATE_FILE_URL,
  "SOUL.md",
);

/**
 * `USER.md` 默认模板。
 */
export const DEFAULT_USER_MD_TEMPLATE = loadInitTemplate(
  USER_TEMPLATE_FILE_URL,
  "USER.md",
);
