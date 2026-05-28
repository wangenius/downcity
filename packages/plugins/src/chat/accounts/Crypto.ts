/**
 * Channel account 默认存储加密工具。
 *
 * 职责说明（中文）
 * - 负责默认 channel account 存储中的敏感字段加解密。
 * - 默认复用平台级 `model-db.key`，保证和现有 `~/.downcity/downcity.db` 数据兼容。
 *
 * 边界说明（中文）
 * - 这里只处理“字符串 <-> 密文”的转换，不负责数据库读写。
 * - 加密算法与密钥文件路径属于默认实现细节，上层不直接感知。
 */

import crypto from "node:crypto";
import fs from "fs-extra";
import path from "node:path";
import { getPlatformStoreKeyPath } from "@downcity/agent/internal/config/PlatformPaths.js";

const ENCRYPTION_ALGO = "aes-256-gcm";

let cachedKey: Buffer | null = null;

function resolveKeyFilePathSync(): string {
  const keyPath = getPlatformStoreKeyPath();
  fs.ensureDirSync(path.dirname(keyPath));
  return keyPath;
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

/**
 * 同步加密字符串。
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
 * 同步解密字符串。
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
