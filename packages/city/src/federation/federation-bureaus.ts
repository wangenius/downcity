/**
 * Federation 服务端 Bureau 注册管理模块。
 *
 * 该能力只能通过本进程中的 Federation 实例调用，不暴露为 Bureau 或 HTTP
 * 管理接口。Federation 启动不会自动创建任何 Bureau Token。
 */

import type { BureauTokenStore } from "./auth/bureau-token-store.js";
import type {
  BureauTokenIssueResult,
  BureauTokenSummary,
  CreateBureauTokenInput,
} from "../types/Bureau.js";

interface FederationBureausOptions {
  /** 获取初始化完成后的 Bureau Token Store。 */
  get_store: () => Promise<BureauTokenStore>;

  /** 查询 Bureau 所属 City 的当前状态。 */
  get_city: (city_id: string) => Promise<{ city_id: string; status: string } | undefined>;
}

/** Federation 本进程内的 Bureau 注册管理入口。 */
export class FederationBureaus {
  constructor(private readonly options: FederationBureausOptions) {}

  /** 为一个 active City 显式创建 Bureau Token。 */
  async create(input: CreateBureauTokenInput): Promise<BureauTokenIssueResult> {
    const city_id = read_required_string(input.city_id, "city_id");
    const city = await this.options.get_city(city_id);
    if (!city) throw new TypeError(`Unknown city: ${city_id}`);
    if (city.status !== "active") throw new TypeError(`City is not active: ${city_id}`);
    return (await this.options.get_store()).create({ ...input, city_id });
  }

  /** 列出 Federation 已显式创建的 Bureau Token 元数据。 */
  async list(): Promise<BureauTokenSummary[]> {
    return (await this.options.get_store()).list();
  }

  /** 立即撤销一条 Bureau Token。 */
  async revoke(token_id: string): Promise<void> {
    await (await this.options.get_store()).revoke(token_id);
  }
}

function read_required_string(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}
