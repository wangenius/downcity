/**
 * Town 数据存储。
 *
 * 基于 CityTableApi，不直接依赖 Drizzle。
 */

import { randomSecret } from "../../utils/helpers.js";
import type { CityTableApi } from "../../store/table-api.js";
import type { Town, TownCreateInput, TownStatus } from "./types.js";

export class TownStore {
  constructor(private table: CityTableApi<Town>) {}

  async list(): Promise<Town[]> {
    return this.table.select();
  }

  async get(town_id: string): Promise<Town | undefined> {
    const rows = await this.table.select({ town_id } as Partial<Town>);
    return rows[0];
  }

  async create(input: TownCreateInput): Promise<Town> {
    const name = String(input.name ?? "").trim();
    if (!name) throw new TypeError("Town name is required");
    const now = new Date().toISOString();
    const town: Town = {
      town_id: input.town_id ?? `town_${randomSecret(12)}`,
      name,
      status: "active",
      created_at: now,
      updated_at: now,
    };
    await this.table.insert(town);
    return town;
  }

  async setStatus(town_id: string, status: TownStatus): Promise<Town> {
    if (status !== "active" && status !== "paused") {
      throw new TypeError(`Invalid town status: ${String(status)}`);
    }
    const existing = await this.get(town_id);
    if (!existing) throw new Error(`Unknown town: ${town_id}`);
    const next: Town = { ...existing, status, updated_at: new Date().toISOString() };
    await this.table.update({ where: { town_id } as Partial<Town>, values: next });
    return next;
  }

  async remove(town_id: string): Promise<void> {
    await this.table.delete({ town_id } as Partial<Town>);
  }
}
