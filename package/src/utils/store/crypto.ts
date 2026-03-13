/**
 * 模型存储加密工具。
 *
 * 关键点（中文）
 * - 使用 AES-256-GCM 对敏感字段（apiKey）做加密落盘。
 * - 默认从 `~/.ship/console/model-db.key` 加载或自动生成密钥。
 */
import crypto from "node:crypto";
import fs from "fs-extra";
import { getConsoleRuntimeDirPath } from "@/console/runtime/ConsolePaths.js";

const MODEL_DB_KEY_PATH = "model-db.key";
const ENCRYPTION_ALGO = "aes-256-gcm";

let cachedKey: Buffer | null = null;

async function resolveKeyFilePath(): Promise<string> {
  const runtimeDir = getConsoleRuntimeDirPath();
  await fs.ensureDir(runtimeDir);
  return `${runtimeDir}/${MODEL_DB_KEY_PATH}`;
}

async function loadOrCreateKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;
  const envKey = String(process.env.SMA_MODEL_DB_KEY || "").trim();
  if (envKey) {
    cachedKey = crypto.createHash("sha256").update(envKey, "utf8").digest();
    return cachedKey;
  }

  const keyPath = await resolveKeyFilePath();
  if (await fs.pathExists(keyPath)) {
    const raw = String(await fs.readFile(keyPath, "utf8")).trim();
    if (raw) {
      const parsed = Buffer.from(raw, "base64");
      if (parsed.length === 32) {
        cachedKey = parsed;
        return cachedKey;
      }
    }
  }

  const next = crypto.randomBytes(32);
  await fs.writeFile(keyPath, next.toString("base64"), { mode: 0o600 });
  cachedKey = next;
  return cachedKey;
}

/**
 * 加密字符串。
 */
export async function encryptText(plainText: string): Promise<string> {
  const key = await loadOrCreateKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/**
 * 解密字符串。
 */
export async function decryptText(cipherText: string): Promise<string> {
  const key = await loadOrCreateKey();
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

