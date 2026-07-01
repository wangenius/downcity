/**
 * 统一鉴权模块。
 *
 * Authenticator 统一处理 admin（secret key）和 user（JWT token）两种鉴权方式。
 * 所有鉴权失败统一抛出 httpError（ErrorWithStatus）。
 *
 * TokenSigner 实例通过 getSigner() 缓存，避免重复 new TokenSigner(key)。
 */

import { bearerToken, httpError } from "../../utils/helpers.js";
import { TokenSigner } from "./token-signer.js";
import { normalizeRouteAuth, type RouteAuth, type RouteIdentity } from "../../service/service.js";
import type { EnvProvider } from "../runtime.js";

import type { CreateUserTokenInput, UserTokenPayload, UserTokenIssueResult, RuntimeUser } from "./types.js";
import type { FederationTrustedIdentity } from "../types.js";

/** 鉴权级别 */
/** 鉴权结果 */
export interface AuthResult {
  /** 鉴权后的实际级别 */
  level: RouteIdentity;
  /** 解析出的用户信息（user 级别时可用） */
  user?: RuntimeUser;
  /** 解析出的 City 信息（user 级别时可用） */
  city?: { city_id: string; status: string };
}

/** 统一鉴权器 */
export class Authenticator {
  /** 缓存的 TokenSigner 实例 */
  private tokenSigner?: TokenSigner;

  constructor(
    private env: EnvProvider,
    private store: () => Promise<{ city: { get(id: string): Promise<{ city_id: string; status: string } | undefined> } }>,
  ) {}

  /**
   * 获取（或创建）TokenSigner 单例。
   *
   * 首次调用时从 env 读取 DOWNCITY_FEDERATION_TOKEN_SIGNING_KEY 创建实例并缓存。
   */
  private getSigner(): TokenSigner {
    if (!this.tokenSigner) {
      const signingKey = this.env.get("DOWNCITY_FEDERATION_TOKEN_SIGNING_KEY");
      if (!signingKey) throw new Error("DOWNCITY_FEDERATION_TOKEN_SIGNING_KEY is required");
      this.tokenSigner = new TokenSigner(signingKey);
    }
    return this.tokenSigner;
  }

  /**
   * 解析请求身份。
   *
   * @param request - 原始 HTTP Request
   * @returns 当前请求身份；无 token 或 token 无效时返回 guest
   */
  async resolve(request: Request): Promise<AuthResult> {
    const token = bearerToken(request);
    if (!token) return { level: "guest" };

    const adminKey = this.env.get("DOWNCITY_FEDERATION_ADMIN_SECRET_KEY");
    if (adminKey && token === adminKey) {
      return { level: "admin" };
    }

    try {
      const payload = await this.getSigner().verify(token);
      const store = await this.store();
      const city = await store.city.get(payload.city_id);
      if (!city) return { level: "guest" };
      if (city.status !== "active") return { level: "guest" };

      return {
        level: "user",
        user: { user_id: payload.user_id, metadata: payload.metadata ?? {} },
        city,
      };
    } catch {
      return { level: "guest" };
    }
  }

  /**
   * 将进程内可信身份转换为统一鉴权结果。
   *
   * 关键点（中文）
   * - 该方法只接受 `Federation.handleRequest()` options 里的值。
   * - 不读取 HTTP header，避免外部请求伪造本机可信身份。
   */
  resolveTrusted(identity: FederationTrustedIdentity): AuthResult {
    if (identity.level === "admin") {
      return { level: "admin" };
    }
    return {
      level: "user",
      user: identity.user,
      city: identity.city,
    };
  }

  /**
   * 根据 action 的 auth 配置判断当前身份是否允许继续。
   *
   * @param result - 当前已解析身份
   * @param required - action 声明的允许身份集合
   * @returns 通过授权后的身份结果
   */
  authorize(result: AuthResult, required?: RouteAuth): AuthResult {
    const allowed = normalizeRouteAuth(required);
    if (allowed.length === 0) return result;
    if (result.level !== "guest" && allowed.includes(result.level)) return result;

    if (result.level === "guest") {
      throw httpError(401, "Authentication required");
    }

    throw httpError(403, `Forbidden for identity: ${result.level}`);
  }

  /**
   * 对请求执行鉴权并强制满足 action 的 auth 配置。
   */
  async authenticate(request: Request, required?: RouteAuth): Promise<AuthResult> {
    return this.authorize(await this.resolve(request), required);
  }

  /**
   * 签发 user_token（验证 city 状态后签发）。
   *
   * @param input - token 创建参数
   * @returns 签发结果（含 token 字符串）
   */
  async createToken(input: CreateUserTokenInput): Promise<UserTokenIssueResult> {
    const store = await this.store();
    const city = await store.city.get(input.city_id);
    if (!city) throw httpError(404, `Unknown city: ${input.city_id}`);
    if (city.status !== "active") throw httpError(403, `City is not active: ${input.city_id}`);

    const user_token = await this.getSigner().sign(input);
    return {
      user_token,
      city_id: input.city_id,
      user_id: input.user_id,
      ...(input.ttl
        ? { expires_at: new Date(Date.now() + TokenSigner.parseTTL(input.ttl) * 1000).toISOString() }
        : {}),
    };
  }

  /**
   * 校验 user_token 并返回载荷。
   *
   * @param token - user_token 字符串
   * @returns 解析出的 token 载荷
   */
  async verifyToken(token: string): Promise<UserTokenPayload> {
    return this.getSigner().verify(token);
  }
}
