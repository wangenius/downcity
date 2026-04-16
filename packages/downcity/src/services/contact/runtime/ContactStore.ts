/**
 * contact 存储。
 *
 * 关键点（中文）
 * - 一个 contact 一个目录，目录内保存 `contact.json` 与 `messages.jsonl`。
 * - 查找 contact 支持 id/name，方便 CLI 使用别名。
 */

import fs from "fs-extra";
import path from "node:path";
import type {
  AgentContact,
  ContactReachability,
  ContactChatMessage,
} from "@/types/contact/Contact.js";
import { hashContactToken, toContactSlug } from "./Token.js";
import {
  getContactDirectoryPath,
  getContactJsonPath,
  getContactMessagesPath,
  getContactsRootPath,
} from "./Paths.js";

function normalizeEndpoint(endpoint: string): string {
  const raw = String(endpoint || "").trim();
  if (!raw) throw new Error("endpoint is required");
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  const url = new URL(withProtocol);
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function isContactLike(input: unknown): input is AgentContact {
  const item = input as Partial<AgentContact> | null;
  return Boolean(
    item &&
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      (typeof item.endpoint === "string" || item.endpoint === null) &&
      (item.reachability === "inbound" ||
        item.reachability === "outbound" ||
        item.reachability === "bidirectional") &&
      (typeof item.outboundToken === "string" || item.outboundToken === null) &&
      (typeof item.inboundTokenHash === "string" || item.inboundTokenHash === null),
  );
}

function resolveReachability(contact: AgentContact): ContactReachability {
  if (contact.reachability) return contact.reachability;
  if (contact.endpoint && contact.outboundToken && contact.inboundTokenHash) {
    return "bidirectional";
  }
  if (contact.endpoint && contact.outboundToken) return "outbound";
  return "inbound";
}

/**
 * 创建 contact id。
 */
export function createStableContactId(name: string): string {
  return `contact_${toContactSlug(name)}`;
}

/**
 * 归一化 endpoint。
 */
export function normalizeContactEndpoint(endpoint: string): string {
  return normalizeEndpoint(endpoint);
}

/**
 * 保存 contact。
 */
export async function saveContact(
  projectRoot: string,
  contact: AgentContact,
): Promise<AgentContact> {
  const normalized: AgentContact = {
    ...contact,
    id: contact.id || createStableContactId(contact.name),
    name: String(contact.name || "").trim(),
    endpoint: contact.endpoint ? normalizeEndpoint(contact.endpoint) : null,
    reachability: resolveReachability(contact),
    status: contact.status || "trusted",
    outboundToken: contact.outboundToken || null,
    inboundTokenHash: contact.inboundTokenHash || null,
    createdAt: contact.createdAt || Date.now(),
  };
  if (!normalized.name) throw new Error("contact name is required");
  if (normalized.reachability !== "inbound" && !normalized.endpoint) {
    throw new Error("contact endpoint is required for outbound contacts");
  }
  if (normalized.reachability !== "inbound" && !normalized.outboundToken) {
    throw new Error("contact approve response did not include the peer token; generate a fresh link and approve again");
  }
  if (normalized.reachability !== "outbound" && !normalized.inboundTokenHash) {
    throw new Error("contact inbound token hash is required for inbound contacts");
  }
  await fs.ensureDir(getContactDirectoryPath(projectRoot, normalized.id));
  await fs.writeJson(getContactJsonPath(projectRoot, normalized.id), normalized, {
    spaces: 2,
  });
  await fs.ensureFile(getContactMessagesPath(projectRoot, normalized.id));
  return normalized;
}

/**
 * 读取 contact。
 */
export async function readContact(
  projectRoot: string,
  contactId: string,
): Promise<AgentContact | null> {
  const filePath = getContactJsonPath(projectRoot, contactId);
  if (!(await fs.pathExists(filePath))) return null;
  const raw = await fs.readJson(filePath).catch(() => null);
  return isContactLike(raw) ? raw : null;
}

/**
 * 列出全部 contact。
 */
export async function listContacts(projectRoot: string): Promise<AgentContact[]> {
  const root = getContactsRootPath(projectRoot);
  if (!(await fs.pathExists(root))) return [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  const contacts: AgentContact[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const contact = await readContact(projectRoot, entry.name);
    if (contact) contacts.push(contact);
  }
  return contacts.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 按 id/name 查找 contact。
 */
export async function findContact(
  projectRoot: string,
  query: string,
): Promise<AgentContact | null> {
  const value = String(query || "").trim();
  if (!value) return null;
  const contacts = await listContacts(projectRoot);
  const lower = value.toLowerCase();
  return (
    contacts.find((item) => item.id.toLowerCase() === lower) ||
    contacts.find((item) => item.name.toLowerCase() === lower) ||
    contacts.find((item) => item.name.toLowerCase().includes(lower)) ||
    null
  );
}

/**
 * 根据入站 token 查找 contact。
 */
export async function findContactByInboundToken(
  projectRoot: string,
  token: string,
): Promise<AgentContact | null> {
  const tokenHash = hashContactToken(token);
  const contacts = await listContacts(projectRoot);
  return contacts.find((item) => item.inboundTokenHash === tokenHash) || null;
}

/**
 * 更新 contact 最近在线时间。
 */
export async function touchContactSeen(
  projectRoot: string,
  contactId: string,
  seenAt: number = Date.now(),
): Promise<AgentContact | null> {
  const contact = await readContact(projectRoot, contactId);
  if (!contact) return null;
  return await saveContact(projectRoot, {
    ...contact,
    lastSeenAt: seenAt,
  });
}

/**
 * 追加 contact chat 消息。
 */
export async function appendContactMessage(
  projectRoot: string,
  contactId: string,
  message: ContactChatMessage,
): Promise<void> {
  const filePath = getContactMessagesPath(projectRoot, contactId);
  await fs.ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, `${JSON.stringify(message)}\n`, "utf-8");
}

/**
 * 读取 contact chat 历史。
 */
export async function readContactMessages(
  projectRoot: string,
  contactId: string,
): Promise<ContactChatMessage[]> {
  const filePath = getContactMessagesPath(projectRoot, contactId);
  if (!(await fs.pathExists(filePath))) return [];
  const text = await fs.readFile(filePath, "utf-8");
  const out: ContactChatMessage[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as ContactChatMessage;
      if (
        (parsed.role === "local" || parsed.role === "remote") &&
        typeof parsed.text === "string"
      ) {
        out.push(parsed);
      }
    } catch {
      // 忽略损坏的历史行，避免单条坏数据阻断整个 contact。
    }
  }
  return out;
}
