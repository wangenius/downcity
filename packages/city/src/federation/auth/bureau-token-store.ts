/**
 * Federation Bureau Token Store。
 *
 * Token 使用 `fb_<token_id>.<secret>` 格式。数据库只保存完整 token 的 SHA-256 hash，
 * 通过 token_id 定位记录后再比较 hash，从而支持注册表状态校验和撤销。
 */

import { base64UrlEncodeBytes } from "../../utils/helpers.js";
import type { CityTableApi } from "../../store/table-api.js";
import type {
  BureauCapability,
  BureauTokenRecord,
  BureauTokenSummary,
  RegisterBureauTokenInput,
  RuntimeBureau,
} from "../../types/Bureau.js";

const DEFAULT_CAPABILITIES: BureauCapability[] = ["accounts:read"];

/** Bureau Token 持久化与验证入口。 */
export class BureauTokenStore {
  constructor(private readonly table: CityTableApi<BureauTokenRecord>) {}

  /** 登记 CLI 生成的 Bureau Token hash，不接触 Token 明文。 */
  async register(input: RegisterBureauTokenInput): Promise<BureauTokenSummary> {
    const token_id = read_token_id_value(input.token_id);
    const token_hash = read_token_hash(input.token_hash);
    const city_id = read_required_string(input.city_id, "city_id");
    const capabilities = normalize_capabilities(input.capabilities);
    if ((await this.table.select({ token_id }))[0]) {
      throw new TypeError(`Bureau token already registered: ${token_id}`);
    }
    const now = new Date().toISOString();
    await this.table.insert({
      token_id,
      city_id,
      token_hash,
      capabilities: JSON.stringify(capabilities),
      status: "active",
      created_at: now,
      updated_at: now,
    });
    return {
      token_id,
      city_id,
      capabilities,
      status: "active",
      created_at: now,
      updated_at: now,
    };
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
      city_id: record.city_id,
      capabilities: normalize_capabilities(JSON.parse(record.capabilities) as BureauCapability[]),
    };
  }

  /** 列出 Bureau Token 元数据，不返回 token hash。 */
  async list(): Promise<BureauTokenSummary[]> {
    return (await this.table.select()).map((record) => ({
      token_id: record.token_id,
      city_id: record.city_id,
      capabilities: normalize_capabilities(JSON.parse(record.capabilities) as BureauCapability[]),
      status: record.status,
      created_at: record.created_at,
      updated_at: record.updated_at,
    }));
  }

  /** 立即撤销 Bureau Token。 */
  async revoke(token_id: string): Promise<void> {
    const id = read_required_string(token_id, "token_id");
    if (!(await this.table.select({ token_id: id }))[0]) {
      throw new TypeError(`Unknown Bureau token: ${id}`);
    }
    await this.table.update({
      where: { token_id: id },
      values: { status: "revoked", updated_at: new Date().toISOString() },
    });
  }
}

function read_token_id_value(value: unknown): string {
  const token_id = read_required_string(value, "token_id");
  if (!/^br_[A-Za-z0-9_-]{16,}$/u.test(token_id)) {
    throw new TypeError("token_id must use the br_<random> format");
  }
  return token_id;
}

function read_token_hash(value: unknown): string {
  const token_hash = read_required_string(value, "token_hash");
  if (!/^[A-Za-z0-9_-]{43}$/u.test(token_hash)) {
    throw new TypeError("token_hash must be a SHA-256 Base64URL value");
  }
  return token_hash;
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
  const allowed = new Set<BureauCapability>(["accounts:read"]);
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
