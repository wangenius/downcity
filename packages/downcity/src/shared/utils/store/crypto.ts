/**
 * 模型存储加密工具。
 *
 * 关键点（中文）
 * - 使用 AES-256-GCM 对敏感字段（apiKey）做加密落盘。
 * - 默认从 `~/.downcity/main/model-db.key` 加载或自动生成密钥。
 */
import crypto from "node:crypto";
import fs from "fs-extra";
import path from "node:path";
import { getConsoleModelDbKeyPath } from "@/city/runtime/console/ConsolePaths.js";

const MODEL_DB_KEY_PATH = "model-db.key";
const ENCRYPTION_ALGO = "aes-256-gcm";

let cachedKey: Buffer | null = null;

/**
 * 重置缓存密钥。
 *
 * 关键点（中文）
 * - 仅在迁移阶段替换 key 文件后调用，确保后续解密重新从磁盘加载最新 key。
 */
export function resetModelDbKeyCache(): void {
  cachedKey = null;
}

function resolveKeyFilePathSync(): string {
  const keyPath = getConsoleModelDbKeyPath();
  fs.ensureDirSync(path.dirname(keyPath));
  return keyPath;
}

async function resolveKeyFilePath(): Promise<string> {
  return resolveKeyFilePathSync();
}

function loadOrCreateKeySync(): Buffer {
  if (cachedKey) return cachedKey;
  const envKey = String(process.env.DC_MODEL_DB_KEY || "").trim();
  if (envKey) {
    cachedKey = crypto.createHash("sha256").update(envKey, "utf8").digest();
    return cachedKey;
  }

  const keyPath = resolveKeyFilePathSync();
  if (fs.existsSync(keyPath)) {
    const raw = String(fs.readFileSync(keyPath, "utf8")).trim();
    if (raw) {
      const parsed = Buffer.from(raw, "base64");
      if (parsed.length === 32) {
        cachedKey = parsed;
        return cachedKey;
      }
    }
  }

  const next = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, next.toString("base64"), { mode: 0o600 });
  cachedKey = next;
  return cachedKey;
}

async function loadOrCreateKey(): Promise<Buffer> {
  return loadOrCreateKeySync();
}

/**
 * 同步加密字符串（用于同步配置读取链路）。
 */
export function encryptTextSync(plainText: string): string {
  const key = loadOrCreateKeySync();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/**
 * 同步解密字符串（用于同步配置读取链路）。
 */
export function decryptTextSync(cipherText: string): string {
  const key = loadOrCreateKeySync();
  const packed = Buffer.from(cipherText, "base64");
  if (packed.length < 28) {
    throw new Error("Invalid encrypted payload");
  }
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const body = packed.subarray(28);
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(body), decipher.final()]);
  return plain.toString("utf8");
}

/**
 * 加密字符串。
 */
export async function encryptText(plainText: string): Promise<string> {
  await loadOrCreateKey();
  return encryptTextSync(plainText);
}

/**
 * 解密字符串。
 */
export async function decryptText(cipherText: string): Promise<string> {
  await loadOrCreateKey();
  return decryptTextSync(cipherText);
}
