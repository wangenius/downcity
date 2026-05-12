/**
 * contact link 本地状态存储。
 *
 * 关键点（中文）
 * - link code 明文只展示给用户；本地落盘只保存 secret hash。
 * - approve 成功后写入 usedAt 和恢复元数据，确保一次性语义并支持同一 agent 幂等重试。
 */

import fs from "fs-extra";
import type { ContactLinkRecord } from "@/types/contact/ContactLink.js";
import { getContactLinkPath, getContactLinksRootPath } from "./Paths.js";

function isLinkRecord(input: unknown): input is ContactLinkRecord {
  const item = input as Partial<ContactLinkRecord> | null;
  return Boolean(
    item &&
      typeof item.id === "string" &&
      typeof item.agentName === "string" &&
      typeof item.endpoint === "string" &&
      typeof item.secretHash === "string" &&
      typeof item.createdAt === "number" &&
      typeof item.expiresAt === "number",
  );
}

/**
 * 保存 link 记录。
 */
export async function saveContactLinkRecord(
  projectRoot: string,
  record: ContactLinkRecord,
): Promise<void> {
  await fs.ensureDir(getContactLinksRootPath(projectRoot));
  await fs.writeJson(getContactLinkPath(projectRoot, record.id), record, {
    spaces: 2,
  });
}

/**
 * 读取 link 记录。
 */
export async function readContactLinkRecord(
  projectRoot: string,
  linkId: string,
): Promise<ContactLinkRecord | null> {
  const filePath = getContactLinkPath(projectRoot, linkId);
  if (!(await fs.pathExists(filePath))) return null;
  const raw = await fs.readJson(filePath).catch(() => null);
  return isLinkRecord(raw) ? raw : null;
}
