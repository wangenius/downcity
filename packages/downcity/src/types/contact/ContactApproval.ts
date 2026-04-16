/**
 * contact approve 协议运行时类型。
 *
 * 关键点（中文）
 * - 这里只描述 link approve 状态机需要的输入，不包含具体存储实现。
 * - link approve 是点对点能力码消费流程，token 由协议自动交换。
 */

import type { ContactApproveLinkRequest } from "./ContactLink.js";

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
