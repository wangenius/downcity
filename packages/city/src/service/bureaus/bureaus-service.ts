/**
 * Federation Bureau 上下文服务。
 *
 * Bureau 使用自身 Token 获取绑定的 City 与 capability。Token 明文由 CLI 在
 * 运维侧生成；本服务的管理动作只登记 hash、列出元数据和撤销注册记录。
 */

import { Service } from "../service.js";
import type { BureauTokenStore } from "../../federation/auth/bureau-token-store.js";
import type { CityStore } from "../cities/city-store.js";
import type { BureauCapability } from "../../types/Bureau.js";

/** Federation 内置 Bureau 上下文服务。 */
export class BureausService extends Service {
  private store!: BureauTokenStore;
  private city_store!: CityStore;

  constructor() {
    super({ id: "bureaus", name: "Bureaus" });
    this.instruction = [
      "返回当前产品后端 Bureau Token 绑定的可信 City 上下文。",
      "管理端可登记 CLI 生成的 Token hash、列出注册记录或立即撤销访问。",
      "Federation 不生成或返回 Bureau Token 明文。",
    ].join("\n");

    this.action("context", async (ctx) => ({
      token_id: ctx.bureau!.token_id,
      city_id: ctx.bureau!.city_id,
      capabilities: ctx.bureau!.capabilities,
    }), {
      method: "GET",
      auth: ["bureau"],
    });

    this.action("register", async (ctx) => {
      const city_id = String(ctx.input.city_id ?? "").trim();
      const city = await this.city_store.get(city_id);
      if (!city) throw new TypeError(`Unknown city: ${city_id}`);
      if (city.status !== "active") throw new TypeError(`City is not active: ${city_id}`);
      return await this.store.register({
        token_id: String(ctx.input.token_id ?? ""),
        token_hash: String(ctx.input.token_hash ?? ""),
        city_id,
        capabilities: ctx.input.capabilities as BureauCapability[] | undefined,
      });
    }, { auth: ["admin"] });

    this.action("list", async () => ({ items: await this.store.list() }), {
      method: "GET",
      auth: ["admin"],
    });

    this.action("revoke", async (ctx) => {
      await this.store.revoke(String(ctx.input.token_id ?? ""));
      return { success: true };
    }, { auth: ["admin"] });
  }

  async _onInit(): Promise<void> {
    this.store = this._bureauTokenStore!;
    this.city_store = this._cityStore!;
  }
}
