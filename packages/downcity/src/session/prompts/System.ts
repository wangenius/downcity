/**
 * System prompt 统一导出入口（门面层）。
 *
 * 关键点（中文）
 * - 具体实现收敛到 `sessions/prompts/system/SystemDomain.ts`、`sessions/prompts/common/*` 与 `sessions/prompts/variables/*`。
 * - 便于调用方按需平滑迁移到更细粒度模块。
 */

export {
  DEFAULT_SHIP_PROMPTS,
  buildContextSystemPrompt,
  resolveSystemContextProfile,
  resolveStaticSystemPrompts,
  loadServiceSystemPrompts,
  loadPluginSystemPrompts,
  buildSessionSystemMessages,
  resolveSessionSystemMessages,
} from "@session/prompts/system/SystemDomain.js";
export {
  transformPromptsIntoSystemMessages,
} from "@session/prompts/common/PromptRenderer.js";
export { replaceVariablesInPrompts } from "@session/prompts/variables/VariableReplacer.js";
