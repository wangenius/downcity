/**
 * 模型直推理相关类型。
 *
 * 关键点（中文）
 * - 只描述“直接调用模型回复”这条轻量链路。
 * - 不混入 session、chat queue、tool-call 等 agent 运行时语义。
 */

/**
 * 模型直推理输入。
 */
export interface ConsoleModelInferenceInput {
  /**
   * 要调用的模型池 modelId。
   */
  modelId: string;

  /**
   * 用户主问题。
   */
  prompt: string;

  /**
   * 可选系统提示词。
   */
  system?: string;

  /**
   * 可选页面上下文（通常是页面 Markdown 或选区正文）。
   */
  pageContext?: string;
}

/**
 * 模型直推理输出。
 */
export interface ConsoleModelInferenceResult {
  /**
   * 本次使用的模型池 modelId。
   */
  modelId: string;

  /**
   * 归一化后的用户问题。
   */
  prompt: string;

  /**
   * 模型返回的最终文本。
   */
  text: string;
}

/**
 * 模型直推理服务端口。
 */
export interface ConsoleModelInferenceService {
  /**
   * 使用指定模型执行一次轻量文本推理。
   */
  inferWithModel(
    input: ConsoleModelInferenceInput,
  ): Promise<ConsoleModelInferenceResult>;
}
