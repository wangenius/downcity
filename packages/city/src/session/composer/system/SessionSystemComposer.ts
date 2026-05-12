/**
 * SessionSystemComposer：Session system messages Composer 抽象。
 *
 * 关键点（中文）
 * - 专职负责“会话上下文 -> system messages”解析。
 * - 与 tools / step 编排解耦，避免 LocalSessionCore 过载。
 */

import type { SystemModelMessage } from "ai";
import { SessionComposer } from "@session/composer/SessionComposer.js";

/**
 * Session system Composer 抽象类。
 */
export abstract class SessionSystemComposer extends SessionComposer {
  /**
   * 解析器名称（由具体实现声明）。
   */
  abstract readonly name: string;

  /**
   * 解析本轮 system messages。
   */
  abstract resolve(): Promise<SystemModelMessage[]>;
}
