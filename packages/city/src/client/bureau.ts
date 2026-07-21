/**
 * Bureau 产品后端客户端。
 *
 * Bureau 是某个 City 的可选后端入口：启动时使用 Bureau Token 获取自身
 * City 上下文，运行时使用 Federation 公钥在本地验证 user_token。它不承载
 * Federation 管理能力，也不会把 user_token 发送到在线 identify 接口。
 */

import { decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import { httpError } from "../utils/helpers.js";
import type {
  BureauContext,
  BureauFetch,
  BureauIdentity,
  BureauOptions,
} from "../types/Bureau.js";
import type { UserProfile } from "../types/User.js";
import type {
  FederationDiscovery,
  FederationJwks,
  FederationPublicJwk,
} from "../federation/auth/types.js";
import { USER_TOKEN_ALGORITHM } from "../federation/auth/federation-key-store.js";
import { normalize_user_token, read_user_token_payload } from "../federation/auth/user-token-authority.js";

const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

interface BureauCache {
  /** Federation 发现信息。 */
  discovery: FederationDiscovery;
  /** Federation 公钥集合。 */
  jwks: FederationJwks;
  /** Bureau 当前注册上下文。 */
  context: BureauContext;
  /** 缓存失效时间。 */
  expires_at: number;
}

/** 已通过本地验签的用户后端会话。 */
export class BureauUser {
  /** 当前用户身份。 */
  readonly identity: BureauIdentity;

  constructor(
    identity: BureauIdentity,
    private readonly federation_url: string,
    private readonly user_token: string,
    private readonly fetcher: BureauFetch,
  ) {
    this.identity = identity;
  }

  /** 在线读取 Federation 当前用户 Profile。 */
  async profile(): Promise<UserProfile | null> {
    const response = await this.fetcher(`${this.federation_url}/v1/accounts/me`, {
      method: "GET",
      headers: { authorization: `Bearer ${this.user_token}` },
    });
    if (!response.ok) {
      throw httpError(response.status, "Federation user profile unavailable");
    }
    const body = await response.json() as { profile?: UserProfile | null };
    return body.profile ?? null;
  }
}

/** Bureau 产品后端客户端。 */
export class Bureau {
  /** 当前 Bureau 绑定的 City ID；首次读取上下文后可用。 */
  get city_id(): string | undefined {
    return this.cache?.context.city_id;
  }

  private readonly federation_url: string;
  private readonly bureau_token: string;
  private readonly fetcher: BureauFetch;
  private readonly cache_ttl: number;
  private cache?: BureauCache;
  private refresh_promise?: Promise<BureauCache>;

  constructor(options: BureauOptions) {
    if (!options || typeof options !== "object") {
      throw new TypeError("Bureau options are required");
    }
    this.federation_url = normalize_federation_url(options.federation_url);
    this.bureau_token = read_required_string(options.bureau_token, "bureau_token");
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.cache_ttl = read_cache_ttl(options.jwks_cache_ttl);
  }

  /** 获取当前 Bureau 在 Federation 中注册的可信 City 上下文。 */
  async context(): Promise<BureauContext> {
    const context = (await this.get_cache(false)).context;
    return { ...context, capabilities: [...context.capabilities] };
  }

  /** 从 HTTP Request 或 user_token 中本地识别 Federation 用户。 */
  async identify(input: Request | string): Promise<BureauIdentity> {
    const user_token = typeof input === "string" ? read_token_string(input) : read_request_token(input);
    const normalized_token = normalize_user_token(user_token);
    let cache = await this.get_cache(false);
    let key = find_jwk(cache.jwks, normalized_token);
    if (!key) {
      cache = await this.get_cache(true);
      key = find_jwk(cache.jwks, normalized_token);
    }
    if (!key) throw httpError(401, "Unknown token signing key");

    try {
      const public_key = await importJWK(key, USER_TOKEN_ALGORITHM);
      const result = await jwtVerify(normalized_token, public_key, {
        algorithms: [USER_TOKEN_ALGORITHM],
        audience: cache.discovery.user_token_audience,
        issuer: cache.discovery.issuer,
      });
      const payload = read_user_token_payload(result.payload);
      if (payload.city_id !== cache.context.city_id) {
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

  /** 验证请求并创建一个可读取 Federation 用户数据的会话。 */
  async user(input: Request | string): Promise<BureauUser> {
    const user_token = typeof input === "string" ? read_token_string(input) : read_request_token(input);
    const identity = await this.identify(user_token);
    return new BureauUser(identity, this.federation_url, user_token, this.fetcher);
  }

  private async get_cache(force_refresh: boolean): Promise<BureauCache> {
    if (!force_refresh && this.cache && this.cache.expires_at > Date.now()) return this.cache;
    if (!this.refresh_promise) {
      this.refresh_promise = this.refresh_cache().finally(() => {
        this.refresh_promise = undefined;
      });
    }
    return this.refresh_promise;
  }

  private async refresh_cache(): Promise<BureauCache> {
    const discovery = await read_json<FederationDiscovery>(
      this.fetcher,
      `${this.federation_url}/.well-known/downcity.json`,
      "Federation discovery unavailable",
    );
    validate_discovery(discovery, this.federation_url);

    const [jwks, context] = await Promise.all([
      read_json<FederationJwks>(
        this.fetcher,
        discovery.jwks_uri,
        "Federation signing keys unavailable",
      ),
      read_json<BureauContext>(
        this.fetcher,
        `${this.federation_url}/v1/bureaus/context`,
        "Bureau context unavailable",
        { authorization: `Bearer ${this.bureau_token}` },
      ),
    ]);
    validate_jwks(jwks);
    validate_context(context);
    const cache: BureauCache = {
      discovery,
      jwks,
      context,
      expires_at: Date.now() + this.cache_ttl,
    };
    this.cache = cache;
    return cache;
  }
}

function find_jwk(jwks: FederationJwks, jwt: string): FederationPublicJwk | undefined {
  const header = decodeProtectedHeader(jwt);
  if (header.alg !== USER_TOKEN_ALGORITHM) throw httpError(401, "Invalid user token algorithm");
  const key_id = typeof header.kid === "string" ? header.kid : "";
  if (!key_id) throw httpError(401, "Unknown token signing key");
  return jwks.keys.find((key) => key.kid === key_id);
}

function read_request_token(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw httpError(401, "Authentication required");
  return read_required_string(authorization.slice("Bearer ".length), "user_token");
}

function read_token_string(value: string): string {
  const token = value.trim();
  return read_required_string(token.startsWith("Bearer ") ? token.slice("Bearer ".length) : token, "user_token");
}

function normalize_federation_url(value: unknown): string {
  const input = read_required_string(value, "federation_url").replace(/\/+$/, "");
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("federation_url must use http or https");
  }
  if (url.username || url.password) throw new TypeError("federation_url must not contain credentials");
  return input;
}

function validate_discovery(discovery: FederationDiscovery, federation_url: string): void {
  if (!discovery || typeof discovery !== "object") throw httpError(503, "Federation discovery unavailable");
  read_required_string(discovery.issuer, "Federation issuer");
  if (discovery.user_token_audience !== "downcity:user") throw httpError(503, "Invalid Federation user token audience");
  const expected = new URL(`${federation_url}/.well-known/jwks.json`);
  const actual = new URL(discovery.jwks_uri);
  if (actual.origin !== expected.origin || actual.pathname !== expected.pathname) {
    throw httpError(503, "Invalid Federation JWKS location");
  }
}

function validate_jwks(jwks: FederationJwks): void {
  if (!jwks || !Array.isArray(jwks.keys)) throw httpError(503, "Federation signing keys unavailable");
  for (const key of jwks.keys) {
    if (key.kty !== "OKP" || key.crv !== "Ed25519" || key.alg !== USER_TOKEN_ALGORITHM
      || key.use !== "sig" || typeof key.kid !== "string" || typeof key.x !== "string") {
      throw httpError(503, "Invalid Federation signing key");
    }
    if ("d" in key) throw httpError(503, "Federation JWKS exposed a private key");
  }
}

function validate_context(context: BureauContext): void {
  if (!context || typeof context !== "object") throw httpError(503, "Bureau context unavailable");
  read_required_string(context.token_id, "Bureau token_id");
  read_required_string(context.city_id, "Bureau city_id");
  if (!Array.isArray(context.capabilities)) throw httpError(503, "Invalid Bureau capabilities");
}

async function read_json<T>(
  fetcher: BureauFetch,
  url: string,
  error_message: string,
  extra_headers: Record<string, string> = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(url, { headers: { accept: "application/json", ...extra_headers } });
  } catch {
    throw httpError(503, error_message);
  }
  if (!response.ok) throw httpError(response.status === 401 ? 401 : 503, error_message);
  try {
    return await response.json() as T;
  } catch {
    throw httpError(503, error_message);
  }
}

function read_required_string(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}

function read_cache_ttl(value: number | undefined): number {
  if (value === undefined) return DEFAULT_CACHE_TTL;
  if (!Number.isFinite(value) || value <= 0) throw new TypeError("jwks_cache_ttl must be a positive number");
  return value;
}

function is_http_error(error: unknown): error is Error & { statusCode: number } {
  return error instanceof Error && typeof (error as { statusCode?: unknown }).statusCode === "number";
}

function map_identify_error(error: unknown): Error {
  const code = error && typeof error === "object" ? String((error as { code?: unknown }).code ?? "") : "";
  if (code === "ERR_JWT_EXPIRED") return httpError(401, "User token expired");
  if (code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED") return httpError(401, "Invalid user token signature");
  if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED") return httpError(401, "Invalid user token claims");
  return httpError(401, "Invalid user token");
}
