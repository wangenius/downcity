/**
 * RuntimeOrchestrator：运行时编排组件实现。
 *
 * 关键点（中文）
 * - 统一组装 requestId/tools。
 * - step 边界回调从 RequestContext 读取，Agent 不直接管理来源。
 */

import { generateId } from "@utils/Id.js";
import {
  requestContext,
  type RequestContext,
} from "@main/context/manager/RequestContext.js";
import { OrchestratorComponent } from "@main/agent/components/OrchestratorComponent.js";
import type {
  OrchestratorComposeInput,
  OrchestratorComposeResult,
} from "@main/agent/components/OrchestratorComponent.js";
import type { Tool } from "ai";

type RuntimeOrchestratorOptions = {
  /**
   * 读取当前可用工具集合。
   */
  getTools: () => Record<string, Tool>;
};

/**
 * RuntimeOrchestrator 默认实现。
 */
export class RuntimeOrchestrator extends OrchestratorComponent {
  readonly name = "runtime_orchestrator";
  private readonly getTools: RuntimeOrchestratorOptions["getTools"];

  constructor(options: RuntimeOrchestratorOptions) {
    super();
    this.getTools = options.getTools;
  }

  private readStepCallbackFromRequestContext(
    ctx: RequestContext | undefined,
  ): OrchestratorComposeResult["onStepCallback"] {
    const candidate = ctx?.onStepCallback;
    if (typeof candidate === "function") return candidate;
    return undefined;
  }

  async compose(
    input: OrchestratorComposeInput,
  ): Promise<OrchestratorComposeResult> {
    const contextId = String(input.contextId || "").trim();
    if (!contextId) {
      throw new Error(
        "RuntimeOrchestrator.compose requires a non-empty contextId",
      );
    }
    const requestId = generateId();
    const tools = this.getTools();
    const ctx = requestContext.getStore();
    const onStepCallback = this.readStepCallbackFromRequestContext(ctx);
    return {
      requestId,
      tools: tools && typeof tools === "object" ? { ...tools } : {},
      ...(onStepCallback ? { onStepCallback } : {}),
    };
  }
}
