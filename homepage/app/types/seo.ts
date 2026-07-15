/**
 * Homepage SEO 类型定义。
 *
 * 该模块集中描述 canonical、hreflang 与 sitemap 所需的数据结构，避免路由模块
 * 各自拼接站点 URL 后产生域名、尾斜杠和语言路径不一致。
 */

/** 页面支持的公开语言。 */
export type SeoLocale = "en" | "zh";

/** 页面级 SEO 元信息生成参数。 */
export type SeoPageMetaOptions = {
  /** 浏览器标题以及 Open Graph、Twitter 使用的页面标题。 */
  title: string;
  /** 搜索结果摘要以及社交分享使用的页面说明。 */
  description: string;
  /** 当前页面的公开路径，不包含域名、查询参数和哈希。 */
  pathname: string;
  /** 当前页面自然覆盖的关键词；未提供时不输出 keywords 标签。 */
  keywords?: string;
  /** Open Graph 内容类型，营销页默认使用 website。 */
  open_graph_type?: "website" | "article";
  /** Twitter 卡片类型，默认使用 summary。 */
  twitter_card?: "summary" | "summary_large_image";
  /** 社交分享图片路径，默认使用全站 social-icon.png。 */
  image_pathname?: string;
  /** 页面是否存在英文与中文两个等价版本。 */
  localized?: boolean;
  /** 当前页面另一语言版本的公开路径；文档页应传入真实存在的对应页面。 */
  alternate_pathname?: string;
};

/** sitemap 中单个规范页面及其语言版本。 */
export type SeoSitemapEntry = {
  /** 当前 sitemap 条目的规范公开路径。 */
  pathname: string;
  /** 同一内容的英文页面路径；不存在时不输出英文 hreflang。 */
  english_pathname?: string;
  /** 同一内容的中文页面路径；不存在时不输出中文 hreflang。 */
  chinese_pathname?: string;
};
