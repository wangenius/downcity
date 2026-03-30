/**
 * PrompterComponent：system 管理组件抽象。
 *
 * 关键点（中文）
 * - 专职负责“会话上下文 -> system messages”解析。
 * - 与 tools/requestId/onStep 编排解耦，避免 Orchestrator 过重。
 */

import type { SystemModelMessage } from "ai";
import { SessionComponent } from "./SessionComponent.js";

/**
 * Prompter 组件抽象类。
 */
export abstract class PrompterComponent extends SessionComponent {
  /**
   * 组件名（由具体实现声明）。
   */
  abstract readonly name: string;

  /**
   * 解析本轮 system messages。
   */
  abstract resolve(): Promise<SystemModelMessage[]>;
}
