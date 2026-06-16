/**
 * Env 数据存储。
 *
 * 基于 CityTableApi，不直接依赖 Drizzle。
 */

import { normalizeEnvKey } from "../../utils/helpers.js";
import type { CityTableApi } from "../../store/table-api.js";
import type { EnvEntry, EnvUpsertInput } from "./types.js";

export class EnvStore {
  constructor(private table: CityTableApi<EnvEntry>) {}

  async list(): Promise<EnvEntry[]> {
    return this.table.select();
  }

  async upsert(input: EnvUpsertInput): Promise<EnvEntry> {
    const key = normalizeEnvKey(input.key);
    const value = String(input.value ?? "");
    const rows = await this.table.select({ key } as Partial<EnvEntry>);

    if (rows.length > 0) {
      await this.table.update({
        where: { key } as Partial<EnvEntry>,
        values: { value, updated_at: new Date().toISOString() } as Partial<EnvEntry>,
      });
    } else {
      const now = new Date().toISOString();
      await this.table.insert({ key, value, source: "database", created_at: now, updated_at: now } as EnvEntry);
    }

    return { key, value, source: "database" };
  }

  async remove(key: string): Promise<void> {
    await this.table.delete({ key: normalizeEnvKey(key) } as Partial<EnvEntry>);
  }
}
