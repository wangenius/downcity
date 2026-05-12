/**
 * contact check 类型。
 *
 * 关键点（中文）
 * - check 只检测对方 agent 当前是否在线可用。
 * - check 不创建关系，也不写入 inbox。
 */

/**
 * contact ping 响应。
 */
export interface ContactPingResponse {
  /**
   * ping 是否成功。
   */
  success: boolean;
  /**
   * 对方 agent 名称。
   */
  agentName: string;
  /**
   * 对方 contact service 是否可用。
   */
  service: "contact";
  /**
   * token 校验是否通过。
   */
  authenticated?: boolean;
  /**
   * 失败原因。
   */
  error?: string;
}

/**
 * contact check 结果。
 */
export interface ContactCheckResult {
  /**
   * 检测目标名称或 endpoint。
   */
  target: string;
  /**
   * 目标 endpoint。
   */
  endpoint: string;
  /**
   * 目标是否可访问。
   */
  reachable: boolean;
  /**
   * contact token 是否有效。
   */
  authenticated?: boolean;
  /**
   * 往返耗时。
   */
  latencyMs: number;
  /**
   * 对方 agent 名称。
   */
  agentName?: string;
  /**
   * 失败原因。
   */
  error?: string;
}
