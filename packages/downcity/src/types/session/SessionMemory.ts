/**
 * Session Memory 接入类型。
 *
 * 关键点（中文）
 * - 这里定义 Session 执行链访问 memory 的最小稳定接口。
 * - LocalSessionCore 不直接依赖 AgentContext / service invoke，只依赖这个 port。
 * - 这样可以把 memory 接入限制在 recall / capture 两个热路径动作。
 */

/**
 * 单条召回记忆。
 */
export interface SessionMemoryRecallItem {
  /**
   * 记忆来源路径（相对项目根目录）。
   */
  path: string;
  /**
   * 引用标记（例如 `.downcity/memory/MEMORY.md#L1-L8`）。
   */
  citation: string;
  /**
   * 当前记忆的可读片段文本。
   */
  snippet: string;
  /**
   * 当前结果的归一化相关度分数（0~1）。
   */
  score: number;
  /**
   * 当前结果的来源层（working / daily / longterm）。
   */
  source: string;
}

/**
 * recall 动作输入。
 */
export interface SessionMemoryRecallInput {
  /**
   * 当前会话 ID。
   */
  sessionId: string;
  /**
   * 当前轮用户查询。
   */
  query: string;
}

/**
 * recall 动作输出。
 */
export interface SessionMemoryRecallResult {
  /**
   * 当前轮召回到的记忆条目集合。
   */
  items: SessionMemoryRecallItem[];
}

/**
 * capture 动作输入。
 */
export interface SessionMemoryCaptureInput {
  /**
   * 当前会话 ID。
   */
  sessionId: string;
  /**
   * 当前轮用户查询文本。
   */
  query: string;
  /**
   * 当前轮最终 assistant 文本。
   */
  assistantText: string;
}

/**
 * longterm 候选。
 */
export interface SessionMemoryLongtermCandidate {
  /**
   * 候选类别。
   */
  kind: "preference" | "rule" | "fact" | "decision";
  /**
   * 归一化后的长期表述。
   */
  statement: string;
}

/**
 * Session Memory 运行时端口。
 */
export interface SessionMemoryRuntime {
  /**
   * 根据当前查询召回少量相关记忆。
   */
  recall(
    input: SessionMemoryRecallInput,
  ): Promise<SessionMemoryRecallResult | null>;
  /**
   * 把当前轮问答写入 session 级 working memory。
   */
  capture(input: SessionMemoryCaptureInput): Promise<void>;
}
