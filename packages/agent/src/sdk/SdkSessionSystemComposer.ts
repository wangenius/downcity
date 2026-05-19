/**
 * SDK Session 默认 system composer。
 *
 * 关键点（中文）
 * - 面向 `Agent` SDK 的本地会话执行场景。
 * - 注入静态 PROFILE / SOUL / core prompt、显式注入 service system、显式注册 plugin system 与运行时时钟上下文。
 */

import { SessionSystemComposer } from "@session/composer/system/SessionSystemComposer.js";
import { getSessionRunScope } from "@session/SessionRunScope.js";
import { transformPromptsIntoSystemMessages } from "@session/composer/system/default/PromptRenderer.js";
import { buildRuntimeClockSystemPrompt } from "@session/composer/system/default/variables/VariableReplacer.js";
import type { SessionSystemMessage } from "@/session/types/SessionPrompts.js";

/**
 * 解析 SDK session system messages 的输入。
 */
export interface ResolveSdkSessionSystemMessagesParams {
  /**
   * 当前 agent 绑定的项目根目录。
   */
  projectRoot: string;

  /**
   * 当前 sessionId。
   */
  sessionId: string;

  /**
   * 读取当前生效的静态 system 文本集合。
   */
  getStaticSystemPrompts: () => string[];

  /**
   * 读取当前显式注入 service 的 system 文本集合。
   */
  getServiceSystemPrompts: () => Promise<string[]>;

  /**
   * 读取当前显式注册 plugin 的 system 文本集合。
   */
  getPluginSystemPrompts: () => Promise<string[]>;
}

type SdkSessionSystemComposerOptions = {
  /**
   * 当前 agent 绑定的项目根目录。
   */
  projectRoot: string;

  /**
   * 读取当前生效的静态 system 文本集合。
   */
  getStaticSystemPrompts: () => string[];

  /**
   * 读取当前显式注册 plugin 的 system 文本集合。
   */
  getPluginSystemPrompts: () => Promise<string[]>;

  /**
   * 读取当前显式注入 service 的 system 文本集合。
   */
  getServiceSystemPrompts: () => Promise<string[]>;
};

async function resolvePromptMessages(params: {
  /**
   * 原始 system prompt 文本集合。
   */
  prompts: string[];
  /**
   * 当前项目根目录。
   */
  projectRoot: string;
  /**
   * 当前 sessionId。
   */
  sessionId: string;
}): Promise<SessionSystemMessage[]> {
  const nonEmptyPrompts = params.prompts.filter((item) =>
    String(item || "").trim(),
  );
  return await transformPromptsIntoSystemMessages(nonEmptyPrompts, {
    projectPath: params.projectRoot,
    sessionId: params.sessionId,
    variableMode: "stable",
  });
}

/**
 * 解析 SDK session 当前生效的 system messages。
 */
export async function resolveSdkSessionSystemMessages(
  params: ResolveSdkSessionSystemMessagesParams,
): Promise<SessionSystemMessage[]> {
  const projectRoot = String(params.projectRoot || "").trim();
  const sessionId = String(params.sessionId || "").trim();
  if (!projectRoot) {
    throw new Error("resolveSdkSessionSystemMessages requires a non-empty projectRoot");
  }
  if (!sessionId) {
    throw new Error("resolveSdkSessionSystemMessages requires a non-empty sessionId");
  }
  const staticMessages = await resolvePromptMessages({
    prompts: params.getStaticSystemPrompts(),
    projectRoot,
    sessionId,
  });
  const serviceMessages = await resolvePromptMessages({
    prompts: await params.getServiceSystemPrompts(),
    projectRoot,
    sessionId,
  });
  const pluginMessages = await resolvePromptMessages({
    prompts: await params.getPluginSystemPrompts(),
    projectRoot,
    sessionId,
  });

  return [
    ...staticMessages,
    ...serviceMessages,
    ...pluginMessages,
    {
      role: "system" as const,
      content: buildRuntimeClockSystemPrompt({
        projectPath: projectRoot,
        sessionId,
      }),
    },
  ];
}

/**
 * SDK Session system composer 实现。
 */
export class SdkSessionSystemComposer extends SessionSystemComposer {
  readonly name = "sdk_prompt_system";

  private readonly projectRoot: string;
  private readonly getStaticSystemPrompts: SdkSessionSystemComposerOptions["getStaticSystemPrompts"];
  private readonly getServiceSystemPrompts: SdkSessionSystemComposerOptions["getServiceSystemPrompts"];
  private readonly getPluginSystemPrompts: SdkSessionSystemComposerOptions["getPluginSystemPrompts"];

  constructor(options: SdkSessionSystemComposerOptions) {
    super();
    this.projectRoot = String(options.projectRoot || "").trim();
    this.getStaticSystemPrompts = options.getStaticSystemPrompts;
    this.getServiceSystemPrompts = options.getServiceSystemPrompts;
    this.getPluginSystemPrompts = options.getPluginSystemPrompts;
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
    return await resolveSdkSessionSystemMessages({
      projectRoot: this.projectRoot,
      sessionId,
      getStaticSystemPrompts: this.getStaticSystemPrompts,
      getServiceSystemPrompts: this.getServiceSystemPrompts,
      getPluginSystemPrompts: this.getPluginSystemPrompts,
    });
  }
}
