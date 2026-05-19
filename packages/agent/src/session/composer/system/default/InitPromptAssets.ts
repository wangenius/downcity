/**
 * InitPromptAssets：agent 初始化模板资产。
 *
 * 关键点（中文）
 * - 初始化模板真实来源是 `*.ts.txt` 文本文件，build 时自动生成模块。
 * - 这里统一做 `trimEnd()`，保持模板尾部语义稳定。
 */

import profileTemplateText from "@session/composer/system/default/assets/init/PROFILE.md.js";
import soulTemplateText from "@session/composer/system/default/assets/init/SOUL.md.js";

/**
 * `PROFILE.md` 默认模板。
 */
export const DEFAULT_PROFILE_MD_TEMPLATE = profileTemplateText.trimEnd();

/**
 * `SOUL.md` 默认模板。
 */
export const DEFAULT_SOUL_MD_TEMPLATE = soulTemplateText.trimEnd();
