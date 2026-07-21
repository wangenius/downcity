/**
 * Federation Bureau Token 管理服务。
 *
 * 只有 root 管理身份可以创建、列出和撤销 Bureau Token。普通产品 Bureau
 * 只能使用已签发 token 调用明确允许的身份读取接口。
 */

import { Service } from "../service.js";
import type { BureauCapability } from "../../types/Bureau.js";
import type { BureauTokenStore } from "../../federation/auth/bureau-token-store.js";

/** Federation 内置 Bureau Token 管理服务。 */
export class BureausService extends Service {
  private store!: BureauTokenStore;

  constructor() {
    super({ id: "bureaus", name: "Bureaus" });
    this.instruction = "管理产品后端使用的 Bureau Token；Token 明文只在创建时返回一次。";

    this.action("list", async () => ({ items: await this.store.list() }), {
      method: "GET",
      auth: ["admin"],
    });

    this.action("create", async (ctx) => {
      const capabilities = Array.isArray(ctx.input.capabilities)
        ? ctx.input.capabilities.map(String) as BureauCapability[]
        : undefined;
      const city_id = String(ctx.input.city_id ?? "").trim();
      if (!capabilities?.includes("federation:admin")) {
        const city = await this._cityStore?.get(city_id);
        if (!city) throw new TypeError(`Unknown city: ${city_id}`);
        if (city.status !== "active") throw new TypeError(`City is not active: ${city_id}`);
      }
      return this.store.create({
        name: String(ctx.input.name ?? ""),
        city_id: city_id || undefined,
        capabilities,
      });
    }, { auth: ["admin"] });

    this.action("revoke", async (ctx) => {
      await this.store.revoke(String(ctx.input.token_id ?? ""));
      return { success: true };
    }, { auth: ["admin"] });
  }

  async _onInit(): Promise<void> {
    this.store = this._bureauTokenStore!;
  }
}
