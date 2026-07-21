/**
 * Bureau Token 管理调用器。
 *
 * 该调用器只暴露管理型 Bureau Token 可访问的签发、列表和撤销操作。
 */

import type { RequestInitLike } from "../../http.js";
import type {
  BureauTokenIssueResult,
  BureauTokenSummary,
  CreateBureauTokenInput,
} from "../../../types/Bureau.js";

const PREFIX = "/v1/bureaus";

/** Bureau Token 管理入口。 */
export class BureausInvoker {
  private readonly request_json: <T>(path: string, init: RequestInitLike) => Promise<T>;

  constructor(options: {
    requestJSON: <T>(path: string, init: RequestInitLike) => Promise<T>;
  }) {
    this.request_json = options.requestJSON;
  }

  /** 列出已签发的 Bureau Token 元数据。 */
  list(): Promise<BureauTokenSummary[]> {
    return this.request_json<{ items: BureauTokenSummary[] }>(`${PREFIX}/list`, {
      method: "GET",
    }).then((body) => body.items);
  }

  /** 签发一个只返回一次明文的 Bureau Token。 */
  create(input: CreateBureauTokenInput): Promise<BureauTokenIssueResult> {
    return this.request_json(`${PREFIX}/create`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /** 立即撤销 Bureau Token。 */
  revoke(token_id: string): Promise<{ success: boolean }> {
    return this.request_json(`${PREFIX}/revoke`, {
      method: "POST",
      body: JSON.stringify({ token_id }),
    });
  }
}
