/**
 * DefaultSessionSystemComposer：默认 system Composer。
 *
 * 关键点（中文）
 * - 该实现归属默认 system Composer，统一负责 Session system 解析入口。
 * - 具体“解析 / 加载 / 组装”下沉到 SystemDomain，保持类本身轻量。
 */

import {
  SessionSystemComposer,
} from "@session/composer/system/SessionSystemComposer.js";
import { getSessionRunScope } from "@session/SessionRunScope.js";
import type { AgentContext } from "@/types/agent/AgentContext.js";
import {
  resolveSessionSystemMessages,
  type SystemProfile,
} from "@session/composer/system/default/SystemDomain.js";

type DefaultSessionSystemComposerOptions = {
  /**
   * 项目根目录，用于渲染运行时 system 模板。
   */
  projectRoot: string;

  /**
   * 读取当前生效的静态 system 文本集合。
   */
  getStaticSystemPrompts: () => string[];

  /**
   * 读取当前执行上下文（用于加载 service system 文本）。
   */
  getContext: () => AgentContext;

  /**
   * system 档位（默认 chat）。
   */
  profile?: SystemProfile;
};

/**
 * SessionSystemComposer 默认实现。
 */
export class DefaultSessionSystemComposer extends SessionSystemComposer {
  readonly name = "prompt_system";

  private readonly projectRoot: string;
  private readonly getStaticSystemPrompts: DefaultSessionSystemComposerOptions["getStaticSystemPrompts"];
  private readonly getContext: DefaultSessionSystemComposerOptions["getContext"];
  private readonly profile: SystemProfile;

  constructor(options: DefaultSessionSystemComposerOptions) {
    super();
    const projectRoot = String(options.projectRoot || "").trim();
    if (!projectRoot) {
      throw new Error("DefaultSessionSystemComposer requires a non-empty projectRoot");
    }
    this.projectRoot = projectRoot;
    this.getStaticSystemPrompts = options.getStaticSystemPrompts;
    this.getContext = options.getContext;
    this.profile = options.profile === "task" ? "task" : "chat";
  }

  async resolve() {
    const ctx = getSessionRunScope();
    const sessionId = String(ctx?.sessionId || "").trim();
    if (!sessionId) {
      throw new Error("DefaultSessionSystemComposer.resolve requires a non-empty sessionId");
    }
    return await resolveSessionSystemMessages({
      projectRoot: this.projectRoot,
      sessionId,
      profile: this.profile,
      staticSystemPrompts: this.getStaticSystemPrompts(),
      context: this.getContext(),
    });
  }
}
