/**
 * contact approve 协议运行时类型。
 *
 * 关键点（中文）
 * - 这里只描述 link approve 状态机需要的输入，不包含具体存储实现。
 * - link approve 是点对点能力码消费流程，token 由协议自动交换。
 */

import type { ContactApproveLinkRequest } from "./ContactLink.js";
import type { ContactEndpointReachability } from "./ContactEndpoint.js";
import type { ContactApproveCallbackReason } from "./ContactLink.js";

/**
 * approve 方对“对方能否回连自己”的本地推导结果。
 */
export interface ContactApproveCallbackDecision {
  /**
   * approve 方是否认为发起方可以主动回连自己。
   */
  canReceiveContactCalls: boolean;
  /**
   * 本次推导的原因。
   */
  reason: ContactApproveCallbackReason;
  /**
   * approve 方自己的 endpoint；仅当推导过程解析出了 endpoint 时存在。
   */
  endpoint?: string;
  /**
   * approve 方 endpoint 的粗粒度可达范围。
   */
  requesterReachability: ContactEndpointReachability;
  /**
   * link code 中目标 endpoint 的粗粒度可达范围。
   */
  targetReachability: ContactEndpointReachability;
}

/**
 * 处理远端 contact link approve 请求的输入。
 */
export interface ApproveContactLinkRequestInput {
  /**
   * 当前 agent 项目根目录，用于读取 link 记录并保存 contact。
   */
  projectRoot: string;
  /**
   * 当前 agent 名称，也就是 link 所属方名称。
   */
  ownerAgentName: string;
  /**
   * 当前 agent 对外 endpoint；当 link 记录不存在时仍会返回该值辅助诊断。
   */
  ownerEndpoint: string;
  /**
   * approve 方发来的 link id、secret、agent 名称和可选回连信息。
   */
  request: ContactApproveLinkRequest;
  /**
   * 当前时间戳；测试可注入，生产环境默认使用 Date.now()。
   */
  nowMs?: number;
}
