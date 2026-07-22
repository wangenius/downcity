/**
 * Federation Bureau 注册表管理调用器。
 *
 * 该调用器服务于 Bureau 管理面。Bureau Token 明文由调用方生成，
 * Federation 仅接收 hash 和生命周期管理信息。
 */

import type { RequestInitLike } from "../../http.js";
import type {
  BureauTokenSummary,
  RegisterBureauTokenInput,
} from "../../../types/Bureau.js";

const PREFIX = "/v1/bureaus";

/** Federation Bureau 注册表管理入口。 */
export class BureausInvoker {
  private readonly req: <T>(path: string, init: RequestInitLike) => Promise<T>;

  constructor(options: {
    /** 发送带 Federation Admin 鉴权的 JSON 请求。 */
    requestJSON: <T>(path: string, init: RequestInitLike) => Promise<T>;
  }) {
    this.req = options.requestJSON;
  }

  /** 登记 Bureau Token hash。 */
  register(input: RegisterBureauTokenInput): Promise<BureauTokenSummary> {
    return this.req(`${PREFIX}/register`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /** 列出 Bureau 注册元数据，不返回 hash 或明文。 */
  async list(): Promise<BureauTokenSummary[]> {
    const body = await this.req<{ items: BureauTokenSummary[] }>(`${PREFIX}/list`, {
      method: "GET",
    });
    return body.items;
  }

  /** 立即撤销指定 Bureau Token。 */
  revoke(token_id: string): Promise<{ success: true }> {
    return this.req(`${PREFIX}/revoke`, {
      method: "POST",
      body: JSON.stringify({ token_id }),
    });
  }
}
