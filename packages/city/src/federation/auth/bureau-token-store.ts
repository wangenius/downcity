/**
 * Federation Bureau Token Store。
 *
 * Token 使用 `fb_<token_id>.<secret>` 格式。数据库只保存完整 token 的 SHA-256 hash，
 * 通过 token_id 定位记录后再比较 hash，从而支持即时撤销与 capability 更新。
 */

import { base64UrlEncodeBytes, randomSecret } from "../../utils/helpers.js";
import type { CityTableApi } from "../../store/table-api.js";
import type {
  BureauCapability,
  BureauTokenIssueResult,
  BureauTokenRecord,
  CreateBureauTokenInput,
  RuntimeBureau,
} from "../../types/Bureau.js";

const DEFAULT_CAPABILITIES: BureauCapability[] = ["accounts:read"];

/** Bureau Token 持久化与验证入口。 */
export class BureauTokenStore {
  constructor(private readonly table: CityTableApi<BureauTokenRecord>) {}

  /** 创建 Bureau Token，并只在本次调用返回明文。 */
  async create(input: CreateBureauTokenInput): Promise<BureauTokenIssueResult> {
    const name = read_required_string(input.name, "name");
    const city_id = String(input.city_id ?? "").trim();
    const capabilities = normalize_capabilities(input.capabilities);
    if (capabilities.includes("federation:admin") && city_id) {
      throw new TypeError("federation:admin Bureau Token cannot bind a City");
    }
    if (!capabilities.includes("federation:admin") && !city_id) {
      throw new TypeError("city_id is required for a non-admin Bureau Token");
    }

    const token_id = `br_${randomSecret(12)}`;
    const bureau_token = `fb_${token_id}.${randomSecret(32)}`;
    const now = new Date().toISOString();
    await this.table.insert({
      token_id,
      name,
      city_id,
      token_hash: await hash_token(bureau_token),
      capabilities: JSON.stringify(capabilities),
      status: "active",
      created_at: now,
      updated_at: now,
    });
    return { bureau_token, token_id, city_id, capabilities };
  }

  /** 验证 Bureau Token 并返回绑定身份。 */
  async resolve(bureau_token: string): Promise<RuntimeBureau | undefined> {
    const token_id = read_token_id(bureau_token);
    if (!token_id) return undefined;
    const record = (await this.table.select({ token_id }))[0];
    if (!record || record.status !== "active") return undefined;
    if (record.token_hash !== await hash_token(bureau_token)) return undefined;
    return {
      token_id: record.token_id,
      name: record.name,
      city_id: record.city_id,
      capabilities: normalize_capabilities(JSON.parse(record.capabilities) as BureauCapability[]),
    };
  }

  /** 列出 Bureau Token 元数据，不返回 token hash。 */
  async list(): Promise<Array<Omit<BureauTokenRecord, "token_hash"> & { capabilities: BureauCapability[] }>> {
    return (await this.table.select()).map(({ token_hash: _token_hash, ...record }) => ({
      ...record,
      capabilities: normalize_capabilities(JSON.parse(record.capabilities) as BureauCapability[]),
    }));
  }

  /** 立即撤销 Bureau Token。 */
  async revoke(token_id: string): Promise<void> {
    const id = read_required_string(token_id, "token_id");
    await this.table.update({
      where: { token_id: id },
      values: { status: "revoked", updated_at: new Date().toISOString() },
    });
  }
}

function read_token_id(token: string): string | undefined {
  const match = String(token ?? "").trim().match(/^fb_(br_[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+$/u);
  return match?.[1];
}

async function hash_token(token: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return base64UrlEncodeBytes(new Uint8Array(hash));
}

function normalize_capabilities(input?: BureauCapability[]): BureauCapability[] {
  const values = input ?? DEFAULT_CAPABILITIES;
  const allowed = new Set<BureauCapability>(["accounts:read", "federation:admin"]);
  const result = [...new Set(values)];
  if (result.length === 0) throw new TypeError("Bureau Token requires at least one capability");
  for (const capability of result) {
    if (!allowed.has(capability)) throw new TypeError(`Unknown Bureau capability: ${capability}`);
  }
  return result;
}

function read_required_string(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}
