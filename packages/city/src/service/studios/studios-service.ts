/**
 * studios 内置服务。
 *
 * 关键说明（中文）
 * - City 默认注册该 service。
 * - StudioStore 由 City 初始化并注入，确保鉴权和管理 API 使用同一份 studio 状态。
 */

import { Service } from "../service.js";
import type { Authenticator } from "../../core/auth/authenticator.js";
import { StudioStore } from "./studio-store.js";

export class StudiosService extends Service {
  private store!: StudioStore;
  private auth!: Authenticator;

  constructor() {
    super({ id: "studios", name: "Studios" });
    this.instruction = [
      "管理 City 中的 studio 实体与用户 token 签发。",
      "studio 是用户侧调用的边界，user_token 会绑定到具体 studio。",
      "管理端通常先创建 studio，再通过 tokens/apply 为某个 user_id 签发可调用的 user_token。",
    ].join("\n");

    this.action("list", async () => ({ items: await this.store.list() }), { method: "GET", auth: ["admin"] });

    this.action("create", async (ctx) => {
      return await this.store.create({ name: String(ctx.input.name ?? "") });
    }, { auth: ["admin"] });

    this.action("pause", async (ctx) => {
      return await this.store.setStatus(String(ctx.input.studio_id ?? ""), "paused");
    }, { auth: ["admin"] });

    this.action("activate", async (ctx) => {
      return await this.store.setStatus(String(ctx.input.studio_id ?? ""), "active");
    }, { auth: ["admin"] });

    this.action("remove", async (ctx) => {
      await this.store.remove(String(ctx.input.studio_id ?? ""));
      return { success: true };
    }, { auth: ["admin"] });

    this.action("tokens/apply", async (ctx) => {
      return await this.auth.createToken({
        studio_id: String(ctx.input.studio_id ?? ""),
        user_id: String(ctx.input.user_id ?? ""),
        metadata: ctx.input.metadata as Record<string, unknown> | undefined,
        ttl: ctx.input.ttl as string | number | undefined,
      });
    }, { auth: ["admin"] });
  }

  async _onInit(): Promise<void> {
    this.store = this._studioStore!;
    this.auth = this._authenticator!;

    const existing = await this.store.get("studio_downcity");
    if (!existing) {
      await this.store.create({ studio_id: "studio_downcity", name: "Downcity" });
    }
  }
}
