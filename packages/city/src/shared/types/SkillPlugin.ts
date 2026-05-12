/**
 * Skill Plugin 协议类型。
 *
 * 关键点（中文）
 * - skill 已迁到 plugin 体系，因此把对外 action 名称与 payload 类型统一放到 `types/`。
 * - 该文件只描述插件动作协议，不承载发现、安装或 system 组装逻辑。
 */

/**
 * skill plugin action 名称常量。
 */
export const SKILL_PLUGIN_ACTIONS = {
  /**
   * 查找 skill。
   */
  find: "find",
  /**
   * 安装 skill。
   */
  install: "install",
  /**
   * 列出当前可发现的 skill。
   */
  list: "list",
  /**
   * 读取 skill 正文。
   */
  lookup: "lookup",
} as const;

/**
 * skill 查找输入。
 */
export type SkillPluginFindPayload = {
  /**
   * 用户输入的 skill 查询词。
   */
  query: string;
};

/**
 * skill 安装输入。
 */
export type SkillPluginInstallPayload = {
  /**
   * skill 安装 spec。
   */
  spec: string;
  /**
   * 是否全局安装。
   */
  global?: boolean;
  /**
   * 是否跳过确认。
   */
  yes?: boolean;
  /**
   * 安装目标 agent 名称。
   */
  agent?: string;
};

/**
 * skill 读取输入。
 */
export type SkillPluginLookupPayload = {
  /**
   * 待读取的 skill 名称或 id。
   */
  name: string;
};

/**
 * skill plugin 配置。
 */
export interface SkillPluginConfig {
  /**
   * 额外的 skill 扫描根目录。
   *
   * 说明（中文）
   * - 相对路径基于项目根目录解析。
   * - 典型值：`.agents/skills`、`.my/skills`。
   */
  paths?: string[];
  /**
   * 是否允许扫描项目根目录之外的外部路径。
   *
   * 说明（中文）
   * - 仅影响 `paths` 中落在项目外部的目录。
   * - 用户目录 `~/.agents/skills` 不受此字段限制。
   */
  allowExternalPaths?: boolean;
}

/**
 * 归一化后的 skill plugin 配置。
 */
export interface ResolvedSkillPluginConfig {
  /**
   * 最终生效的额外 skill 扫描根目录。
   */
  paths: string[];
  /**
   * 最终生效的外部路径扫描开关。
   */
  allowExternalPaths: boolean;
}
