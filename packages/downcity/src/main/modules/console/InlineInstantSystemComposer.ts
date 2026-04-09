/**
 * InlineInstantSystemComposer：即时模式临时 session 的 system composer。
 *
 * 关键点（中文）
 * - 只负责把传入的静态 prompt 文本转为 system messages。
 * - 不依赖完整 AgentContext，避免为了即时模式拉起正式 runtime。
 * - 支持项目路径与 sessionId 变量替换，保留 PROFILE/SOUL 等静态提示的可用性。
 */

import { getSessionRunScope } from "@session/SessionRunScope.js";
import { SessionSystemComposer } from "@session/composer/system/SessionSystemComposer.js";
import { transformPromptsIntoSystemMessages } from "@session/composer/system/default/PromptRenderer.js";

type InlineInstantSystemComposerOptions = {
  /**
   * 当前要注入的静态 prompt 文本集合。
   */
  prompts: string[];

  /**
   * 可选项目根目录。
   *
   * 说明（中文）
   * - 用于替换 system prompt 里的项目路径变量。
   */
  projectRoot?: string;
};

/**
 * 即时模式 system composer 默认实现。
 */
export class InlineInstantSystemComposer extends SessionSystemComposer {
  readonly name = "inline_instant_system";

  private readonly prompts: string[];
  private readonly projectRoot: string;

  constructor(options: InlineInstantSystemComposerOptions) {
    super();
    this.prompts = Array.isArray(options.prompts)
      ? options.prompts
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      : [];
    this.projectRoot = String(options.projectRoot || "").trim();
  }

  async resolve() {
    if (this.prompts.length < 1) return [];
    const scope = getSessionRunScope();
    return await transformPromptsIntoSystemMessages(this.prompts, {
      ...(this.projectRoot ? { projectPath: this.projectRoot } : {}),
      ...(String(scope?.sessionId || "").trim()
        ? { sessionId: String(scope?.sessionId || "").trim() }
        : {}),
    });
  }
}
