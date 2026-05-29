/**
 * user_token 签发与校验模块。
 *
 * Downcity 使用 Web Crypto API 的 HMAC-SHA256 生成最小可用的 user_token。
 * 零 Node.js 依赖，兼容所有现代运行时（Node、Workers、Deno、Bun、浏览器）。
 */

import { httpError, base64UrlEncode, base64UrlDecode, base64UrlEncodeBytes, base64UrlDecodeBytes, timingSafeEqualBytes } from "../../utils/helpers.js";
import type { CreateUserTokenInput, UserTokenPayload } from "./types.js";

export class TokenSigner {
  readonly signingKey: string;

  /** 缓存的 CryptoKey，避免每次签名都重新 import */
  private cryptoKey?: Promise<CryptoKey>;

  constructor(signingKey: string) {
    if (!signingKey) {
      throw new Error("TokenSigner requires a signing key");
    }
    this.signingKey = signingKey;
  }

  /**
   * 获取（或缓存）HMAC CryptoKey。
   *
   * 使用 Web Crypto API 的 crypto.subtle.importKey，
   * 首次调用时创建并缓存 Promise，后续复用。
   */
  private getCryptoKey(): Promise<CryptoKey> {
    if (!this.cryptoKey) {
      const encoder = new TextEncoder();
      this.cryptoKey = crypto.subtle.importKey(
        "raw",
        encoder.encode(this.signingKey),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
      );
    }
    return this.cryptoKey;
  }

  /** 签发 user_token */
  async sign(input: CreateUserTokenInput): Promise<string> {
    if (!input || typeof input.product_id !== "string" || input.product_id.length === 0) {
      throw new TypeError("product_id is required");
    }

    if (typeof input.user_id !== "string" || input.user_id.length === 0) {
      throw new TypeError("user_id is required");
    }

    const ttl = input.ttl;
    const now = Math.floor(Date.now() / 1000);
    const payload: UserTokenPayload = {
      aud: "downcity:user",
      product_id: input.product_id,
      user_id: input.user_id,
      metadata: input.metadata ?? {},
      iat: now,
    };

    if (ttl) {
      payload.exp = now + TokenSigner.parseTTL(ttl);
    }

    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = await signPayload(await this.getCryptoKey(), encodedPayload);
    return `ub_${encodedPayload}.${signature}`;
  }

  /** 校验并解析 user_token，失败抛 httpError(401) */
  async verify(token: string): Promise<UserTokenPayload> {
    const rawToken = token.startsWith("ub_") ? token.slice(3) : token;
    const [encodedPayload, signature] = rawToken.split(".");

    if (!encodedPayload || !signature) {
      throw httpError(401, "Invalid user token");
    }

    if (!await verifyPayload(await this.getCryptoKey(), encodedPayload, signature)) {
      throw httpError(401, "Invalid user token signature");
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as UserTokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp <= now) {
      throw httpError(401, "User token expired");
    }

    if (payload.aud !== "downcity:user") {
      throw httpError(401, "Invalid user token audience");
    }

    if (!payload.product_id || !payload.user_id) {
      throw httpError(401, "Invalid user token payload");
    }

    return payload;
  }

  /** 把 ttl 解析成秒数 */
  static parseTTL(ttl: string | number): number {
    if (typeof ttl === "number" && Number.isFinite(ttl) && ttl > 0) {
      return ttl;
    }

    if (typeof ttl !== "string") {
      throw new TypeError("ttl must be a positive number of seconds or a string like 1h");
    }

    const match = ttl.match(/^(\d+)(s|m|h|d)$/);
    if (!match) {
      throw new Error(`Invalid ttl: ${ttl}`);
    }

    const value = Number(match[1]);
    const unit = match[2] as "s" | "m" | "h" | "d";
    const multipliers = {
      s: 1,
      m: 60,
      h: 60 * 60,
      d: 24 * 60 * 60,
    };

    return value * multipliers[unit];
  }
}

/**
 * 使用 HMAC-SHA256 对 payload 签名，返回 base64url 编码的签名。
 */
async function signPayload(cryptoKey: CryptoKey, encodedPayload: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(encodedPayload),
  );
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

/**
 * 验证 HMAC-SHA256 签名是否匹配。
 */
async function verifyPayload(cryptoKey: CryptoKey, encodedPayload: string, signature: string): Promise<boolean> {
  const expected = base64UrlDecodeBytes(signature);
  const actual = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(encodedPayload),
  );
  return timingSafeEqualBytes(new Uint8Array(actual), expected);
}
