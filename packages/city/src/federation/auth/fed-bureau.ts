/**
 * 产品后端 Federation 身份识别模块。
 *
 * FedBureau 从可信 Federation 获取 discovery 与 JWKS，在本地验证 user_token，
 * 并强制 token.city_id 与当前产品后端的 city_id 一致。
 */

import {
  decodeProtectedHeader,
  importJWK,
  jwtVerify,
} from "jose";
import { httpError } from "../../utils/helpers.js";
import type {
  FedBureauFetch,
  FedBureauOptions,
  FedIdentity,
} from "../../types/FedBureau.js";
import type {
  FederationDiscovery,
  FederationJwks,
  FederationPublicJwk,
} from "./types.js";
import { USER_TOKEN_ALGORITHM } from "./federation-key-store.js";
import {
  normalize_user_token,
  read_user_token_payload,
} from "./user-token-authority.js";

const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

interface BureauCache {
  /** 已验证的 Federation discovery。 */
  discovery: FederationDiscovery;
  /** 从可信 Federation 获取的公开 JWKS。 */
  jwks: FederationJwks;
  /** 当前缓存失效时间，Unix 毫秒。 */
  expires_at: number;
}

/** 产品后端 Federation 身份识别入口。 */
export class FedBureau {
  /** 当前产品后端绑定的 City ID。 */
  readonly city_id: string;

  private readonly federation_url: string;
  private readonly fetcher: FedBureauFetch;
  private readonly cache_ttl: number;
  private cache?: BureauCache;
  private refresh_promise?: Promise<BureauCache>;

  constructor(options: FedBureauOptions) {
    if (!options || typeof options !== "object") {
      throw new TypeError("FedBureau options are required");
    }
    this.federation_url = normalize_federation_url(options.federation_url);
    this.city_id = read_required_string(options.city_id, "city_id");
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.cache_ttl = read_cache_ttl(options.jwks_cache_ttl);
  }

  /**
   * 从 HTTP Request 或 user_token 识别 Federation 用户身份。
   *
   * Request 必须使用 `Authorization: Bearer <user_token>`；字符串可以直接传 user_token。
   */
  async identify(input: Request | string): Promise<FedIdentity> {
    const token = typeof input === "string" ? read_token_string(input) : read_request_token(input);
    const jwt = normalize_user_token(token);
    let cache = await this.get_cache(false);
    let key = find_jwk(cache.jwks, jwt);
    if (!key) {
      cache = await this.get_cache(true);
      key = find_jwk(cache.jwks, jwt);
    }
    if (!key) throw httpError(401, "Unknown token signing key");

    try {
      const public_key = await importJWK(key, USER_TOKEN_ALGORITHM);
      const result = await jwtVerify(jwt, public_key, {
        algorithms: [USER_TOKEN_ALGORITHM],
        audience: cache.discovery.user_token_audience,
        issuer: cache.discovery.issuer,
      });
      const payload = read_user_token_payload(result.payload);
      if (payload.city_id !== this.city_id) {
        throw httpError(403, "Token does not belong to this City");
      }
      return {
        user_id: payload.user_id,
        city_id: payload.city_id,
        metadata: payload.metadata ?? {},
        token_id: payload.jti,
        expires_at: payload.exp,
      };
    } catch (error) {
      if (is_http_error(error)) throw error;
      throw map_identify_error(error);
    }
  }

  private async get_cache(force_refresh: boolean): Promise<BureauCache> {
    if (!force_refresh && this.cache && this.cache.expires_at > Date.now()) {
      return this.cache;
    }
    if (!this.refresh_promise) {
      this.refresh_promise = this.refresh_cache().finally(() => {
        this.refresh_promise = undefined;
      });
    }
    return this.refresh_promise;
  }

  private async refresh_cache(): Promise<BureauCache> {
    const discovery_url = `${this.federation_url}/.well-known/downcity.json`;
    const discovery = await read_json<FederationDiscovery>(
      this.fetcher,
      discovery_url,
      "Federation discovery unavailable",
    );
    validate_discovery(discovery, this.federation_url);
    const jwks = await read_json<FederationJwks>(
      this.fetcher,
      discovery.jwks_uri,
      "Federation signing keys unavailable",
    );
    validate_jwks(jwks);
    const cache: BureauCache = {
      discovery,
      jwks,
      expires_at: Date.now() + this.cache_ttl,
    };
    this.cache = cache;
    return cache;
  }
}

function find_jwk(jwks: FederationJwks, jwt: string): FederationPublicJwk | undefined {
  const header = decodeProtectedHeader(jwt);
  if (header.alg !== USER_TOKEN_ALGORITHM) {
    throw httpError(401, "Invalid user token algorithm");
  }
  const key_id = typeof header.kid === "string" ? header.kid : "";
  if (!key_id) throw httpError(401, "Unknown token signing key");
  return jwks.keys.find((key) => key.kid === key_id);
}

function read_request_token(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    throw httpError(401, "Authentication required");
  }
  return authorization.slice("Bearer ".length).trim();
}

function read_token_string(value: string): string {
  const token = value.trim();
  return token.startsWith("Bearer ") ? token.slice("Bearer ".length).trim() : token;
}

function normalize_federation_url(value: unknown): string {
  const input = read_required_string(value, "federation_url").replace(/\/+$/, "");
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("federation_url must use http or https");
  }
  if (url.username || url.password) {
    throw new TypeError("federation_url must not contain credentials");
  }
  return input;
}

function validate_discovery(discovery: FederationDiscovery, federation_url: string): void {
  if (!discovery || typeof discovery !== "object") {
    throw httpError(503, "Federation discovery unavailable");
  }
  read_required_string(discovery.issuer, "Federation issuer");
  if (discovery.user_token_audience !== "downcity:user") {
    throw httpError(503, "Invalid Federation user token audience");
  }
  const expected_jwks_url = new URL(`${federation_url}/.well-known/jwks.json`);
  const actual_jwks_url = new URL(discovery.jwks_uri);
  if (actual_jwks_url.origin !== expected_jwks_url.origin
    || actual_jwks_url.pathname !== expected_jwks_url.pathname) {
    throw httpError(503, "Invalid Federation JWKS location");
  }
}

function validate_jwks(jwks: FederationJwks): void {
  if (!jwks || !Array.isArray(jwks.keys)) {
    throw httpError(503, "Federation signing keys unavailable");
  }
  for (const key of jwks.keys) {
    if (key.kty !== "OKP" || key.crv !== "Ed25519" || key.alg !== USER_TOKEN_ALGORITHM
      || key.use !== "sig" || typeof key.kid !== "string" || typeof key.x !== "string") {
      throw httpError(503, "Invalid Federation signing key");
    }
    if ("d" in key) throw httpError(503, "Federation JWKS exposed a private key");
  }
}

async function read_json<T>(
  fetcher: FedBureauFetch,
  url: string,
  error_message: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(url, { headers: { accept: "application/json" } });
  } catch {
    throw httpError(503, error_message);
  }
  if (!response.ok) throw httpError(503, error_message);
  try {
    return await response.json() as T;
  } catch {
    throw httpError(503, error_message);
  }
}

function read_required_string(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function read_cache_ttl(value: number | undefined): number {
  if (value === undefined) return DEFAULT_CACHE_TTL;
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError("jwks_cache_ttl must be a positive number");
  }
  return value;
}

function is_http_error(error: unknown): error is Error & { statusCode: number } {
  return error instanceof Error
    && typeof (error as { statusCode?: unknown }).statusCode === "number";
}

function map_identify_error(error: unknown): Error {
  const code = error && typeof error === "object"
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  if (code === "ERR_JWT_EXPIRED") return httpError(401, "User token expired");
  if (code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED") {
    return httpError(401, "Invalid user token signature");
  }
  if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED") {
    return httpError(401, "Invalid user token claims");
  }
  return httpError(401, "Invalid user token");
}
