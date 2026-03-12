/**
 * Skills system 文本构建器。
 *
 * 关键点（中文）
 * - 只负责输出“可用技能概览”提示词
 * - 不再读取/写入 pinnedSkillIds，不做会话级技能注入
 * - `lookup` 行为为无状态：由 action 读取 SKILL.md 后通过协议注入 user message
 */

import { requestContext } from "@agent/context/manager/RequestContext.js";
import type { ServiceRuntime } from "@/agent/service/ServiceRuntime.js";
import { discoverClaudeSkillsSync } from "./Discovery.js";
import { renderClaudeSkillsPromptSection } from "./Prompt.js";
import { setContextAvailableSkills } from "./Store.js";

function getCurrentContextId(): string {
  const request = requestContext.getStore();
  return String(request?.contextId || "").trim();
}

/**
 * 构建 skills system 文本。
 *
 * 算法流程（中文）
 * 1) 扫描可用 skills
 * 2) 更新 context 的可用技能快照（仅用于观察态）
 * 3) 输出 skills overview 文本
 */
export async function buildSkillsSystemText(
  runtime: ServiceRuntime,
): Promise<string> {
  const contextId = getCurrentContextId();
  const discoveredSkills = discoverClaudeSkillsSync(
    runtime.rootPath,
    runtime.config,
  );

  if (contextId) {
    setContextAvailableSkills(contextId, discoveredSkills);
  }

  return renderClaudeSkillsPromptSection(
    runtime.rootPath,
    runtime.config,
    discoveredSkills,
  ).trim();
}
