/**
 * contact share 类型。
 *
 * 关键点（中文）
 * - send 只发送资产型内容，文本对话走 chat。
 * - MVP 仅支持 skill bundle，后续可扩展 file bundle。
 */

/**
 * contact share 类型。
 */
export type ContactShareType = "skill";

/**
 * inbox share 状态。
 */
export type ContactInboxShareStatus = "pending" | "received";

/**
 * inbox share 轻量元信息。
 */
export interface ContactInboxShareMeta {
  /**
   * share 稳定标识。
   */
  id: string;
  /**
   * 发送方 contact id。
   */
  fromContactId: string;
  /**
   * 发送方 agent 名称。
   */
  fromAgentName: string;
  /**
   * share 类型。
   */
  type: ContactShareType;
  /**
   * 面向用户展示的标题。
   */
  title: string;
  /**
   * 当前接收状态。
   */
  status: ContactInboxShareStatus;
  /**
   * 接收时间戳。
   */
  receivedAt: number;
  /**
   * 内容总大小。
   */
  sizeBytes: number;
  /**
   * 内容条目数量。
   */
  itemCount: number;
}

/**
 * skill bundle 中的单个文件 manifest。
 */
export interface ContactSkillBundleFile {
  /**
   * skill 目录内相对路径。
   */
  path: string;
  /**
   * 文件 sha256。
   */
  sha256: string;
}

/**
 * skill bundle 中的单个 skill manifest。
 */
export interface ContactSkillBundleItem {
  /**
   * skill 稳定标识。
   */
  id: string;
  /**
   * skill 展示名称。
   */
  name: string;
  /**
   * skill 描述。
   */
  description: string;
  /**
   * share files 下的 skill 根目录名。
   */
  root: string;
  /**
   * skill 文件列表。
   */
  files: ContactSkillBundleFile[];
}

/**
 * skill bundle payload。
 */
export interface ContactSkillBundlePayload {
  /**
   * payload 类型。
   */
  kind: "skillBundle";
  /**
   * skill manifest 列表。
   */
  skills: ContactSkillBundleItem[];
}

/**
 * inbox share payload。
 */
export type ContactInboxSharePayload = ContactSkillBundlePayload;

/**
 * inbox share 文件内容。
 */
export interface ContactInboxShareFileInput {
  /**
   * share files 目录下的相对路径。
   */
  relativePath: string;
  /**
   * UTF-8 文件内容。
   */
  content: string;
}

/**
 * 保存 inbox share 的输入。
 */
export interface SaveContactInboxShareInput {
  /**
   * share 轻量元信息。
   */
  meta: ContactInboxShareMeta;
  /**
   * share payload。
   */
  payload: ContactInboxSharePayload;
  /**
   * share 附带文件。
   */
  files: ContactInboxShareFileInput[];
}

/**
 * 远端 receive share 请求。
 */
export interface ContactReceiveShareRequest extends SaveContactInboxShareInput {
  /**
   * 发送方 contact id。
   */
  senderContactId: string;
}
