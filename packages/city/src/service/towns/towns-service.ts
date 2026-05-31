/**
 * towns 内置服务。
 *
 * 关键说明（中文）
 * - City 默认注册该 service。
 * - TownStore 由 City 初始化并注入，确保鉴权和管理 API 使用同一份 town 状态。
 */

import { Service } from "../service.js";
import type { Authenticator } from "../../core/auth/authenticator.js";
import { TownStore } from "./town-store.js";

export class TownsService extends Service {
  private store!: TownStore;
  private auth!: Authenticator;

  constructor() {
    super({ id: "towns", name: "Towns" });
    this.instruction = [
      "管理 City 中的 town 实体与用户 token 签发。",
      "town 是用户侧调用的边界，user_token 会绑定到具体 town。",
      "管理端通常先创建 town，再通过 tokens/apply 为某个 user_id 签发可调用的 user_token。",
    ].join("\n");

    this.action("list", async () => ({ items: await this.store.list() }), { method: "GET", auth: ["admin"] });

    this.action("create", async (ctx) => {
      return await this.store.create({
        name: String(ctx.input.name ?? ""),
        town_id: String(ctx.input.town_id ?? "").trim() || undefined,
      });
    }, { auth: ["admin"] });

    this.action("pause", async (ctx) => {
      return await this.store.setStatus(String(ctx.input.town_id ?? ""), "paused");
    }, { auth: ["admin"] });

    this.action("activate", async (ctx) => {
      return await this.store.setStatus(String(ctx.input.town_id ?? ""), "active");
    }, { auth: ["admin"] });

    this.action("remove", async (ctx) => {
      await this.store.remove(String(ctx.input.town_id ?? ""));
      return { success: true };
    }, { auth: ["admin"] });

    this.action("tokens/apply", async (ctx) => {
      return await this.auth.createToken({
        town_id: String(ctx.input.town_id ?? ""),
        user_id: String(ctx.input.user_id ?? ""),
        metadata: ctx.input.metadata as Record<string, unknown> | undefined,
        ttl: ctx.input.ttl as string | number | undefined,
      });
    }, { auth: ["admin"] });
  }

  async _onInit(): Promise<void> {
    this.store = this._townStore!;
    this.auth = this._authenticator!;

    const existing = await this.store.get("town_downcity");
    if (!existing) {
      await this.store.create({ town_id: "town_downcity", name: "Downcity" });
    }
  }
}
