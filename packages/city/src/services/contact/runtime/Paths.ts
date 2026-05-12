/**
 * contact service 路径规则。
 *
 * 关键点（中文）
 * - 所有 contact 运行时状态都收敛在 `.downcity/contact`。
 * - 每个 contact 一个目录；每条 inbox share 一个目录。
 */

import path from "node:path";

function cleanSegment(input: string, label: string): string {
  const value = String(input || "").trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error(`Invalid ${label}: ${input}`);
  }
  if (value === "." || value === ".." || value.includes("..")) {
    throw new Error(`Invalid ${label}: ${input}`);
  }
  return value;
}

/**
 * contact 根目录。
 */
export function getContactRootPath(projectRoot: string): string {
  return path.join(projectRoot, ".downcity", "contact");
}

/**
 * contacts 根目录。
 */
export function getContactsRootPath(projectRoot: string): string {
  return path.join(getContactRootPath(projectRoot), "contacts");
}

/**
 * 单个 contact 目录。
 */
export function getContactDirectoryPath(
  projectRoot: string,
  contactId: string,
): string {
  return path.join(getContactsRootPath(projectRoot), cleanSegment(contactId, "contactId"));
}

/**
 * 单个 contact 元信息文件。
 */
export function getContactJsonPath(projectRoot: string, contactId: string): string {
  return path.join(getContactDirectoryPath(projectRoot, contactId), "contact.json");
}

/**
 * 单个 contact 的长期对话历史文件。
 */
export function getContactMessagesPath(
  projectRoot: string,
  contactId: string,
): string {
  return path.join(getContactDirectoryPath(projectRoot, contactId), "messages.jsonl");
}

/**
 * link 根目录。
 */
export function getContactLinksRootPath(projectRoot: string): string {
  return path.join(getContactRootPath(projectRoot), "links");
}

/**
 * 单个 link 记录文件。
 */
export function getContactLinkPath(projectRoot: string, linkId: string): string {
  return path.join(getContactLinksRootPath(projectRoot), `${cleanSegment(linkId, "linkId")}.json`);
}

/**
 * inbox 根目录。
 */
export function getContactInboxRootPath(projectRoot: string): string {
  return path.join(getContactRootPath(projectRoot), "inbox");
}

/**
 * 单个 inbox share 目录。
 */
export function getContactInboxSharePath(
  projectRoot: string,
  shareId: string,
): string {
  return path.join(getContactInboxRootPath(projectRoot), cleanSegment(shareId, "shareId"));
}

/**
 * 单个 inbox share 元信息文件。
 */
export function getContactInboxShareMetaPath(
  projectRoot: string,
  shareId: string,
): string {
  return path.join(getContactInboxSharePath(projectRoot, shareId), "meta.json");
}

/**
 * 单个 inbox share payload 文件。
 */
export function getContactInboxSharePayloadPath(
  projectRoot: string,
  shareId: string,
): string {
  return path.join(getContactInboxSharePath(projectRoot, shareId), "payload.json");
}

/**
 * 单个 inbox share 文件根目录。
 */
export function getContactInboxShareFilesPath(
  projectRoot: string,
  shareId: string,
): string {
  return path.join(getContactInboxSharePath(projectRoot, shareId), "files");
}

/**
 * received 根目录。
 */
export function getContactReceivedRootPath(projectRoot: string): string {
  return path.join(getContactRootPath(projectRoot), "received");
}

/**
 * 单个 received share 目录。
 */
export function getContactReceivedSharePath(
  projectRoot: string,
  shareId: string,
): string {
  return path.join(getContactReceivedRootPath(projectRoot), cleanSegment(shareId, "shareId"));
}
