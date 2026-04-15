/**
 * contact link 类型。
 *
 * 关键点（中文）
 * - link code 是人工转交的一次性点对点建联凭证。
 * - approve 成功后 link 立即失效。
 */

/**
 * link code 内部载荷。
 */
export interface ContactLinkCodePayload {
  /**
   * link code 协议版本。
   */
  version: 1;
  /**
   * link 稳定标识。
   */
  linkId: string;
  /**
   * 发起方 agent 名称。
   */
  agentName: string;
  /**
   * 发起方 HTTP endpoint。
   */
  endpoint: string;
  /**
   * 一次性明文 secret。
   */
  secret: string;
  /**
   * link 创建时间戳。
   */
  createdAt: number;
  /**
   * link 过期时间戳。
   */
  expiresAt: number;
}

/**
 * 本地保存的 link 记录。
 */
export interface ContactLinkRecord {
  /**
   * link 稳定标识。
   */
  id: string;
  /**
   * 发起方 agent 名称。
   */
  agentName: string;
  /**
   * 发起方 HTTP endpoint。
   */
  endpoint: string;
  /**
   * 一次性 secret hash。
   */
  secretHash: string;
  /**
   * link 创建时间戳。
   */
  createdAt: number;
  /**
   * link 过期时间戳。
   */
  expiresAt: number;
  /**
   * link 被使用的时间戳。
   */
  usedAt?: number | null;
}

/**
 * 远端 approve link 请求。
 */
export interface ContactApproveLinkRequest {
  /**
   * link 稳定标识。
   */
  linkId: string;
  /**
   * 一次性明文 secret。
   */
  secret: string;
  /**
   * approve 方 agent 名称。
   */
  agentName: string;
  /**
   * approve 方 HTTP endpoint；缺省时只建立发起方可接收请求的单向 contact。
   */
  endpoint?: string;
  /**
   * 发起方后续调用 approve 方时使用的 token；只有 approve 方提供 endpoint 时才需要。
   */
  tokenForRequester?: string;
}

/**
 * 远端 approve link 响应。
 */
export interface ContactApproveLinkResponse {
  /**
   * approve 是否成功。
   */
  success: boolean;
  /**
   * 发起方 agent 名称。
   */
  agentName: string;
  /**
   * 发起方 HTTP endpoint。
   */
  endpoint: string;
  /**
   * approve 方后续调用发起方时使用的 token。
   */
  tokenForOwner: string;
  /**
   * 失败原因。
   */
  error?: string;
}
