/**
 * contact inbox 存储。
 *
 * 关键点（中文）
 * - 每条 share 都是独立目录，避免大内容堆进单个 JSON。
 * - `inbox` 列表只读取 `meta.json`，保持轻量。
 */

import fs from "fs-extra";
import path from "node:path";
import type {
  ContactInboxShareMeta,
  ContactInboxSharePayload,
  SaveContactInboxShareInput,
} from "@/types/contact/ContactShare.js";
import {
  getContactInboxRootPath,
  getContactInboxShareFilesPath,
  getContactInboxShareMetaPath,
  getContactInboxSharePath,
  getContactInboxSharePayloadPath,
  getContactReceivedSharePath,
} from "./Paths.js";

function assertSafeRelativePath(relativePath: string): string {
  const value = String(relativePath || "").trim();
  if (!value) throw new Error("relativePath is required");
  if (path.isAbsolute(value)) throw new Error(`Absolute path is not allowed: ${value}`);
  const normalized = path.normalize(value);
  if (
    normalized === "." ||
    normalized.startsWith("..") ||
    normalized.includes(`${path.sep}..${path.sep}`) ||
    normalized.endsWith(`${path.sep}..`)
  ) {
    throw new Error(`Unsafe relative path: ${value}`);
  }
  return normalized;
}

function isMeta(input: unknown): input is ContactInboxShareMeta {
  const item = input as Partial<ContactInboxShareMeta> | null;
  return Boolean(
    item &&
      typeof item.id === "string" &&
      typeof item.fromAgentName === "string" &&
      (item.status === "pending" || item.status === "received"),
  );
}

/**
 * 保存 inbox share。
 */
export async function saveContactInboxShare(
  projectRoot: string,
  input: SaveContactInboxShareInput,
): Promise<ContactInboxShareMeta> {
  const sharePath = getContactInboxSharePath(projectRoot, input.meta.id);
  await fs.ensureDir(sharePath);
  await fs.writeJson(getContactInboxShareMetaPath(projectRoot, input.meta.id), input.meta, {
    spaces: 2,
  });
  await fs.writeJson(
    getContactInboxSharePayloadPath(projectRoot, input.meta.id),
    input.payload,
    { spaces: 2 },
  );

  const filesRoot = getContactInboxShareFilesPath(projectRoot, input.meta.id);
  for (const file of input.files) {
    const relativePath = assertSafeRelativePath(file.relativePath);
    const outputPath = path.join(filesRoot, relativePath);
    const encoding = file.encoding === "base64" ? "base64" : "utf8";
    const content =
      encoding === "base64"
        ? Buffer.from(file.content, "base64")
        : Buffer.from(file.content, "utf-8");
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, content);
  }

  return input.meta;
}

/**
 * 读取 inbox share meta。
 */
export async function readContactInboxShareMeta(
  projectRoot: string,
  shareId: string,
): Promise<ContactInboxShareMeta | null> {
  const filePath = getContactInboxShareMetaPath(projectRoot, shareId);
  if (!(await fs.pathExists(filePath))) return null;
  const raw = await fs.readJson(filePath).catch(() => null);
  return isMeta(raw) ? raw : null;
}

/**
 * 读取 inbox share payload。
 */
export async function readContactInboxSharePayload(
  projectRoot: string,
  shareId: string,
): Promise<ContactInboxSharePayload | null> {
  const filePath = getContactInboxSharePayloadPath(projectRoot, shareId);
  if (!(await fs.pathExists(filePath))) return null;
  const raw = await fs.readJson(filePath).catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const payload = raw as ContactInboxSharePayload;
  return payload.kind === "share" ? payload : null;
}

/**
 * 列出 inbox share。
 */
export async function listContactInboxShares(
  projectRoot: string,
): Promise<ContactInboxShareMeta[]> {
  const root = getContactInboxRootPath(projectRoot);
  if (!(await fs.pathExists(root))) return [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  const shares: ContactInboxShareMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const meta = await readContactInboxShareMeta(projectRoot, entry.name);
    if (meta) shares.push(meta);
  }
  return shares.sort((a, b) => b.receivedAt - a.receivedAt);
}

/**
 * 标记 share 已接收，并复制轻量状态到 received。
 */
export async function markContactInboxShareReceived(
  projectRoot: string,
  shareId: string,
): Promise<ContactInboxShareMeta> {
  const meta = await readContactInboxShareMeta(projectRoot, shareId);
  if (!meta) throw new Error(`Share not found: ${shareId}`);
  const next: ContactInboxShareMeta = {
    ...meta,
    status: "received",
  };
  await fs.writeJson(getContactInboxShareMetaPath(projectRoot, shareId), next, {
    spaces: 2,
  });
  const receivedPath = getContactReceivedSharePath(projectRoot, shareId);
  await fs.ensureDir(receivedPath);
  await fs.writeJson(path.join(receivedPath, "meta.json"), next, {
    spaces: 2,
  });
  return next;
}

/**
 * 读取 share 文件根目录。
 */
export function getInboxShareFilesRoot(projectRoot: string, shareId: string): string {
  return getContactInboxShareFilesPath(projectRoot, shareId);
}
