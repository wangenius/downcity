/**
 * SDK Session 默认 system composer。
 *
 * 关键点（中文）
 * - 面向 `Agent` SDK 的本地会话执行场景。
 * - v1 先只注入静态 PROFILE / SOUL / core prompt 与运行时时钟上下文。
 * - 暂不把 service/plugin system 注入暴露到 SDK 主路径。
 */

import { SessionSystemComposer } from "@session/composer/system/SessionSystemComposer.js";
import { getSessionRunScope } from "@session/SessionRunScope.js";
import { transformPromptsIntoSystemMessages } from "@session/composer/system/default/PromptRenderer.js";
import { buildRuntimeClockSystemPrompt } from "@session/composer/system/default/variables/VariableReplacer.js";

type SdkSessionSystemComposerOptions = {
  /**
   * 当前 agent 绑定的项目根目录。
   */
  projectRoot: string;

  /**
   * 读取当前生效的静态 system 文本集合。
   */
  getStaticSystemPrompts: () => string[];
};

/**
 * SDK Session system composer 实现。
 */
export class SdkSessionSystemComposer extends SessionSystemComposer {
  readonly name = "sdk_prompt_system";

  private readonly projectRoot: string;
  private readonly getStaticSystemPrompts: SdkSessionSystemComposerOptions["getStaticSystemPrompts"];

  constructor(options: SdkSessionSystemComposerOptions) {
    super();
    this.projectRoot = String(options.projectRoot || "").trim();
    this.getStaticSystemPrompts = options.getStaticSystemPrompts;
    if (!this.projectRoot) {
      throw new Error("SdkSessionSystemComposer requires a non-empty projectRoot");
    }
  }

  /**
   * 解析本轮 SDK session system messages。
   */
  async resolve() {
    const sessionId = String(getSessionRunScope()?.sessionId || "").trim();
    if (!sessionId) {
      throw new Error("SdkSessionSystemComposer.resolve requires a non-empty sessionId");
    }
    const staticPrompts = this.getStaticSystemPrompts().filter((item) =>
      String(item || "").trim(),
    );
    const staticMessages = await transformPromptsIntoSystemMessages(
      staticPrompts,
      {
        projectPath: this.projectRoot,
        sessionId,
        variableMode: "stable",
      },
    );

    return [
      ...staticMessages,
      {
        role: "system" as const,
        content: buildRuntimeClockSystemPrompt({
          projectPath: this.projectRoot,
          sessionId,
        }),
      },
    ];
  }
}
