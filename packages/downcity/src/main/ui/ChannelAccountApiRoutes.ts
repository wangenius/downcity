/**
 * Console UI Channel Account 路由。
 *
 * 关键点（中文）
 * - 提供全局 channel account 管理接口。
 * - 仅暴露脱敏字段，不返回明文密钥。
 */

import type { Hono } from "hono";
import { ChannelAccountService } from "@/main/ui/ChannelAccountService.js";

/**
 * 注册 Channel Account API 路由。
 */
export function registerConsoleUiChannelAccountRoutes(params: { app: Hono }): void {
  const app = params.app;
  const service = new ChannelAccountService();

  app.get("/api/ui/channel-accounts", async (c) => {
    try {
      const payload = await service.list();
      return c.json({
        success: true,
        ...payload,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/ui/channel-accounts/upsert", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        id?: string;
        channel?: string;
        name?: string;
        identity?: string;
        owner?: string;
        creator?: string;
        botToken?: string;
        appId?: string;
        appSecret?: string;
        domain?: string;
        sandbox?: boolean;
        clearBotToken?: boolean;
        clearAppId?: boolean;
        clearAppSecret?: boolean;
      };
      const payload = await service.upsert({
        id: String(body.id || "").trim(),
        channel: String(body.channel || "").trim(),
        name: String(body.name || "").trim(),
        identity: body.identity,
        owner: body.owner,
        creator: body.creator,
        botToken: body.botToken,
        appId: body.appId,
        appSecret: body.appSecret,
        domain: body.domain,
        sandbox: body.sandbox === true,
        clearBotToken: body.clearBotToken === true,
        clearAppId: body.clearAppId === true,
        clearAppSecret: body.clearAppSecret === true,
      });
      return c.json({
        success: true,
        ...payload,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/ui/channel-accounts/probe", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        channel?: string;
        botToken?: string;
        appId?: string;
        appSecret?: string;
        domain?: string;
        sandbox?: boolean;
      };
      const payload = await service.probe({
        channel: String(body.channel || "").trim(),
        botToken: body.botToken,
        appId: body.appId,
        appSecret: body.appSecret,
        domain: body.domain,
        sandbox: body.sandbox === true,
      });
      return c.json({
        success: true,
        ...payload,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/ui/channel-accounts/remove", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        id?: string;
      };
      const id = String(body.id || "").trim();
      if (!id) {
        return c.json({ success: false, error: "Missing id" }, 400);
      }
      await service.remove(id);
      return c.json({
        success: true,
        id,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });
}
