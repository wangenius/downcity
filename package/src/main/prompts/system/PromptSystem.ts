/**
 * PromptSystem：system 解析组件默认实现。
 *
 * 关键点（中文）
 * - 该实现归属 prompts 层，统一负责 system 解析入口。
 * - 具体“解析/加载/组装”下沉到 SystemDomain，保持类本身轻量。
 */

import {
  PrompterComponent,
  type PrompterResolveInput,
} from "@main/agent/components/PrompterComponent.js";
import type { ServiceRuntime } from "@main/service/ServiceRuntime.js";
import {
  resolveAgentSystemMessages,
  type SystemProfile,
} from "@main/prompts/system/SystemDomain.js";

type PromptSystemOptions = {
  /**
   * 项目根目录，用于渲染运行时 system 模板。
   */
  projectRoot: string;

  /**
   * 读取当前生效的静态 system 文本集合。
   */
  getStaticSystemPrompts: () => string[];

  /**
   * 读取 service runtime（用于加载 service system 文本）。
   */
  getRuntime: () => ServiceRuntime;

  /**
   * system 档位（默认 chat）。
   */
  profile?: SystemProfile;
};

/**
 * PromptSystem 默认实现。
 */
export class PromptSystem extends PrompterComponent {
  readonly name = "prompt_system";

  private readonly projectRoot: string;
  private readonly getStaticSystemPrompts: PromptSystemOptions["getStaticSystemPrompts"];
  private readonly getRuntime: PromptSystemOptions["getRuntime"];
  private readonly profile: SystemProfile;

  constructor(options: PromptSystemOptions) {
    super();
    const projectRoot = String(options.projectRoot || "").trim();
    if (!projectRoot) {
      throw new Error("PromptSystem requires a non-empty projectRoot");
    }
    this.projectRoot = projectRoot;
    this.getStaticSystemPrompts = options.getStaticSystemPrompts;
    this.getRuntime = options.getRuntime;
    this.profile = options.profile === "task" ? "task" : "chat";
  }

  async resolve(input: PrompterResolveInput) {
    const contextId = String(input.contextId || "").trim();
    if (!contextId) {
      throw new Error("PromptSystem.resolve requires a non-empty contextId");
    }
    const requestId = String(input.requestId || "").trim();
    if (!requestId) {
      throw new Error("PromptSystem.resolve requires a non-empty requestId");
    }
    return await resolveAgentSystemMessages({
      projectRoot: this.projectRoot,
      contextId,
      requestId,
      profile: this.profile,
      staticSystemPrompts: this.getStaticSystemPrompts(),
      runtime: this.getRuntime(),
    });
  }
}
