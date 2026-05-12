/**
 * contact share 类型。
 *
 * 关键点（中文）
 * - share 是通用内容分享，不绑定 skill 概念。
 * - 文本、链接、文件、目录都进入 inbox，由接收方显式 receive。
 */

/**
 * share item 类型。
 */
export type ContactShareItemType = "text" | "link" | "file" | "directory";

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
 * share item 中的单个文件 manifest。
 */
export interface ContactShareFileManifest {
  /**
   * item 根目录内相对路径。
   */
  path: string;
  /**
   * 文件 sha256。
   */
  sha256: string;
}

/**
 * share payload 中的单个 item。
 */
export interface ContactShareItem {
  /**
   * item 稳定标识。
   */
  id: string;
  /**
   * item 类型。
   */
  type: ContactShareItemType;
  /**
   * item 展示标题。
   */
  title: string;
  /**
   * 文本内容。
   */
  text?: string;
  /**
   * 链接 URL。
   */
  url?: string;
  /**
   * share files 下的根目录名。
   */
  root?: string;
  /**
   * 文件 manifest 列表。
   */
  files?: ContactShareFileManifest[];
}

/**
 * 通用 share payload。
 */
export interface ContactSharePayload {
  /**
   * payload 类型。
   */
  kind: "share";
  /**
   * share item 列表。
   */
  items: ContactShareItem[];
}

/**
 * inbox share payload。
 */
export type ContactInboxSharePayload = ContactSharePayload;

/**
 * inbox share 文件内容。
 */
export interface ContactInboxShareFileInput {
  /**
   * share files 目录下的相对路径。
   */
  relativePath: string;
  /**
   * 文件内容。
   */
  content: string;
  /**
   * 内容编码。
   *
   * 说明（中文）
   * - 省略时按 `utf8` 处理，兼容测试和手写 payload。
   * - 文件/目录分享默认使用 `base64`，避免二进制文件损坏。
   */
  encoding?: "utf8" | "base64";
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
