/**
 * Auth API 路由。
 *
 * 关键点（中文）
 * - 本模块只承接统一账户 V1 的基础认证接口。
 * - 路由层不做领域判断，所有业务逻辑统一委托给 `AuthService`。
 */

import { Hono, type Context } from "hono";
import type { AuthService } from "./AuthService.js";
import { AuthService as DefaultAuthService } from "./AuthService.js";
import { isAuthError } from "./AuthError.js";
import {
  createRequireAuthMiddleware,
  getAuthPrincipal,
  type AuthMiddlewareVariables,
} from "./AuthMiddleware.js";

/**
 * 注册 auth 路由。
 */
export function registerAuthRoutes(params: {
  app: Hono;
  authService?: AuthService;
}): void {
  const authService = params.authService || new DefaultAuthService();
  const router = new Hono();
  const protectedRouter = new Hono<{ Variables: AuthMiddlewareVariables }>();
  const requireAuth = createRequireAuthMiddleware(authService);

  router.get("/status", (c) => {
    const initialized = authService.hasUsers();
    return c.json({
      success: true,
      initialized,
      requireLogin: initialized,
    });
  });

  router.post("/bootstrap-admin", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        username?: string;
        password?: string;
        displayName?: string;
        tokenName?: string;
      };
      const payload = authService.bootstrapAdmin({
        username: String(body.username || ""),
        password: String(body.password || ""),
        displayName: typeof body.displayName === "string" ? body.displayName : undefined,
        tokenName: typeof body.tokenName === "string" ? body.tokenName : undefined,
      });
      return c.json({ success: true, ...payload });
    } catch (error) {
      return toErrorResponse(c, error);
    }
  });

  router.post("/login", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        username?: string;
        password?: string;
        tokenName?: string;
      };
      const payload = authService.login({
        username: String(body.username || ""),
        password: String(body.password || ""),
        tokenName: typeof body.tokenName === "string" ? body.tokenName : undefined,
      });
      return c.json({ success: true, ...payload });
    } catch (error) {
      return toErrorResponse(c, error);
    }
  });

  protectedRouter.get("/me", requireAuth, (c) => {
    const principal = getAuthPrincipal(c);
    return c.json({
      success: true,
      user: authService.getCurrentUser(principal),
    });
  });

  protectedRouter.get("/token/list", requireAuth, (c) => {
    const principal = getAuthPrincipal(c);
    return c.json({
      success: true,
      tokens: authService.listTokens(principal),
    });
  });

  protectedRouter.post("/token/create", requireAuth, async (c) => {
    try {
      const principal = getAuthPrincipal(c);
      const body = (await c.req.json().catch(() => ({}))) as {
        name?: string;
        expiresAt?: string;
      };
      return c.json({
        success: true,
        token: authService.createToken(principal, {
          name: String(body.name || ""),
          expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : undefined,
        }),
      });
    } catch (error) {
      return toErrorResponse(c, error);
    }
  });

  protectedRouter.post("/token/revoke", requireAuth, async (c) => {
    try {
      const principal = getAuthPrincipal(c);
      const body = (await c.req.json().catch(() => ({}))) as {
        tokenId?: string;
      };
      return c.json({
        success: true,
        token: authService.revokeToken(principal, String(body.tokenId || "")),
      });
    } catch (error) {
      return toErrorResponse(c, error);
    }
  });

  protectedRouter.post("/password/update", requireAuth, async (c) => {
    try {
      const principal = getAuthPrincipal(c);
      const body = (await c.req.json().catch(() => ({}))) as {
        currentPassword?: string;
        nextPassword?: string;
      };
      return c.json({
        success: true,
        user: authService.updatePassword(principal, {
          currentPassword: String(body.currentPassword || ""),
          nextPassword: String(body.nextPassword || ""),
        }),
      });
    } catch (error) {
      return toErrorResponse(c, error);
    }
  });

  router.route("/", protectedRouter);
  params.app.route("/api/auth", router);
}

function toErrorResponse(c: Context, error: unknown) {
  if (isAuthError(error)) {
    return c.json(
      { success: false, error: error.message },
      error.status as 200,
    );
  }
  return c.json({ success: false, error: String(error) }, 500);
}
