/**
 * contact service command 类型。
 *
 * 关键点（中文）
 * - 这里只描述 action payload/response，不承载运行时存储逻辑。
 */

/**
 * contact link command 输入。
 */
export interface ContactLinkCommandPayload {
  /**
   * 对外可访问 endpoint。
   */
  endpoint?: string;
  /**
   * link 过期秒数。
   */
  ttlSeconds?: number;
}

/**
 * contact approve command 输入。
 */
export interface ContactApproveCommandPayload {
  /**
   * 人工转交的 link code。
   */
  code: string;
  /**
   * 本地保存 contact 时使用的别名。
   */
  name?: string;
  /**
   * 本 agent 对外可访问 endpoint。
   */
  endpoint?: string;
}

/**
 * contact check command 输入。
 */
export interface ContactCheckCommandPayload {
  /**
   * 已保存 contact 名称。
   */
  target?: string;
  /**
   * 未保存 agent endpoint。
   */
  endpoint?: string;
}

/**
 * contact chat command 输入。
 */
export interface ContactChatCommandPayload {
  /**
   * 已保存 contact 名称。
   */
  to: string;
  /**
   * 本轮消息正文。
   */
  message?: string;
}

/**
 * contact share command 输入。
 */
export interface ContactShareCommandPayload {
  /**
   * 已保存 contact 名称。
   */
  to: string;
  /**
   * 分享的文本内容。
   */
  text?: string;
  /**
   * 分享的链接列表。
   */
  links?: string[];
  /**
   * 分享的文件或目录路径列表。
   */
  paths?: string[];
}

/**
 * contact receive command 输入。
 */
export interface ContactReceiveCommandPayload {
  /**
   * inbox share id。
   */
  shareId: string;
}
