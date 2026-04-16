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
  /**
   * 已使用该 link 的 approve 方 agent 名称；用于同一 agent 在网络中断或本地保存失败后做幂等重试。
   */
  approvedAgentName?: string | null;
  /**
   * approve 方在建联时提供的 HTTP endpoint；没有公开 endpoint 时为空。
   */
  approvedEndpoint?: string | null;
  /**
   * 发起方发给 approve 方的明文 contact token；只保存在本地 link 记录中，用于同一 link 在有效期内重试恢复。
   */
  tokenForOwner?: string | null;
}

/**
 * approve 方声明自己可被回连的推导原因。
 */
export type ContactApproveCallbackReason =
  | "missing-requester-endpoint"
  | "requester-public"
  | "same-loopback-host"
  | "same-private-network"
  | "requester-not-routable-from-target";

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
  /**
   * approve 方是否判断自己可以被发起方主动回连；该值由 approve 方基于双方 endpoint 自动推导。
   */
  canReceiveContactCalls?: boolean;
  /**
   * approve 方推导 `canReceiveContactCalls` 的原因，方便接收方和用户诊断网络关系。
   */
  callbackReason?: ContactApproveCallbackReason;
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
