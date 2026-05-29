/**
 * products 内置服务。
 *
 * 关键说明（中文）
 * - InfraRuntime 默认注册该 service。
 * - ProductStore 由 InfraRuntime 初始化并注入，确保鉴权和管理 API 使用同一份产品状态。
 */

import { Service } from "../service.js";
import type { Authenticator } from "../../core/auth/authenticator.js";
import { ProductStore } from "./product-store.js";

export class ProductsService extends Service {
  private store!: ProductStore;
  private auth!: Authenticator;

  constructor() {
    super({ id: "products", name: "Products" });
    this.instruction = [
      "管理 InfraRuntime 中的 product 实体与用户 token 签发。",
      "product 是用户侧调用的边界，user_token 会绑定到具体 product。",
      "管理端通常先创建 product，再通过 tokens/apply 为某个 user_id 签发可调用的 user_token。",
    ].join("\n");

    this.action("list", async () => ({ items: await this.store.list() }), { method: "GET", auth: ["admin"] });

    this.action("create", async (ctx) => {
      return await this.store.create({ name: String(ctx.input.name ?? "") });
    }, { auth: ["admin"] });

    this.action("pause", async (ctx) => {
      return await this.store.setStatus(String(ctx.input.product_id ?? ""), "paused");
    }, { auth: ["admin"] });

    this.action("activate", async (ctx) => {
      return await this.store.setStatus(String(ctx.input.product_id ?? ""), "active");
    }, { auth: ["admin"] });

    this.action("remove", async (ctx) => {
      await this.store.remove(String(ctx.input.product_id ?? ""));
      return { success: true };
    }, { auth: ["admin"] });

    this.action("tokens/apply", async (ctx) => {
      return await this.auth.createToken({
        product_id: String(ctx.input.product_id ?? ""),
        user_id: String(ctx.input.user_id ?? ""),
        metadata: ctx.input.metadata as Record<string, unknown> | undefined,
        ttl: ctx.input.ttl as string | number | undefined,
      });
    }, { auth: ["admin"] });
  }

  async _onInit(): Promise<void> {
    this.store = this._productStore!;
    this.auth = this._authenticator!;

    const existing = await this.store.get("prod_downcity");
    if (!existing) {
      await this.store.create({ product_id: "prod_downcity", name: "Downcity" });
    }
  }
}
