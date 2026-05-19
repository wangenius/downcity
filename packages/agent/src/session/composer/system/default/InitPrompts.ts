/**
 * InitPrompts：`city agent create` 默认 prompt 资产加载器。
 *
 * 职责说明（中文）
 * - 统一管理 create 生成的 `PROFILE.md` / `SOUL.md` 默认内容。
 * - 资源集中在 TS 静态资产模块，避免运行时再读取文本文件。
 */
export {
  DEFAULT_PROFILE_MD_TEMPLATE,
  DEFAULT_SOUL_MD_TEMPLATE,
} from "@session/composer/system/default/InitPromptAssets.js";
