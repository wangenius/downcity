/**
 * Federation Bureau 上下文服务。
 *
 * Bureau 使用自身 Token 获取绑定的 City 与 capability。Token 的创建、列表和
 * 撤销只通过 Federation 服务端实例管理，不暴露到该 HTTP Service。
 */

import { Service } from "../service.js";
/** Federation 内置 Bureau 上下文服务。 */
export class BureausService extends Service {
  constructor() {
    super({ id: "bureaus", name: "Bureaus" });
    this.instruction = "返回当前产品后端 Bureau Token 绑定的可信 City 上下文。";

    this.action("context", async (ctx) => ({
      token_id: ctx.bureau!.token_id,
      name: ctx.bureau!.name,
      city_id: ctx.bureau!.city_id,
      capabilities: ctx.bureau!.capabilities,
    }), {
      method: "GET",
      auth: ["bureau"],
    });
  }
}
