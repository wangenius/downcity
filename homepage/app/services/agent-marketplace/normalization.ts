/**
 * Agent Marketplace 表单规范化模块。
 * 说明：
 * 1. 负责仓库链接、可选链接与通用字符串的清洗。
 * 2. 保证公开提交页与审核后台对仓库地址采用同一规范。
 */
import {
  AGENT_MARKETPLACE_CATEGORIES,
  type AgentMarketplaceCategory,
} from "@/types/agent-marketplace";

/**
 * 清理普通文本输入。
 */
export function normalizeTextInput(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 判断分类值是否合法。
 */
export function isAgentMarketplaceCategory(
  value: string,
): value is AgentMarketplaceCategory {
  return AGENT_MARKETPLACE_CATEGORIES.includes(
    value as AgentMarketplaceCategory,
  );
}

/**
 * 规范化公开链接。
 * 说明：
 * 1. 只允许 `http` 与 `https`。
 * 2. 清除 query/hash 与末尾 `/`，减少重复提交。
 */
export function normalizePublicUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https URLs are supported.");
  }

  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

/**
 * 规范化代码仓库链接。
 * 说明：
 * 1. 在通用链接规范基础上，额外去掉 `.git` 后缀。
 * 2. host 统一转小写，尽量避免大小写导致的重复记录。
 */
export function normalizeRepositoryUrl(rawUrl: string) {
  const url = new URL(normalizePublicUrl(rawUrl));
  url.hostname = url.hostname.toLowerCase();
  url.pathname = (url.pathname || "/")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "") || "/";
  return url.toString();
}
