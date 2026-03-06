/**
 * System prompt 统一导出入口（门面层）。
 *
 * 关键点（中文）
 * - 具体实现收敛到 `prompts/system/SystemDomain.ts`、`prompts/common/*` 与 `prompts/variables/*`。
 * - 便于调用方按需平滑迁移到更细粒度模块。
 */

export {
  DEFAULT_SHIP_PROMPTS,
  buildContextSystemPrompt,
  resolveSystemContextProfile,
  resolveStaticSystemPrompts,
  loadServiceSystemPrompts,
  buildAgentSystemMessages,
  resolveAgentSystemMessages,
} from "@main/prompts/system/SystemDomain.js";
export {
  transformPromptsIntoSystemMessages,
} from "@main/prompts/common/PromptRenderer.js";
export { replaceVariablesInPrompts } from "@main/prompts/variables/VariableReplacer.js";
