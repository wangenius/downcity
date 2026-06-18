/**
 * City 数据存储。
 *
 * 基于 CityTableApi，不直接依赖 Drizzle。
 */

import { randomSecret } from "../../utils/helpers.js";
import type { CityTableApi } from "../../store/table-api.js";
import type { City, CityCreateInput, CityStatus } from "./types.js";

export class CityStore {
  constructor(private table: CityTableApi<City>) {}

  async list(): Promise<City[]> {
    return this.table.select();
  }

  async get(city_id: string): Promise<City | undefined> {
    const rows = await this.table.select({ city_id } as Partial<City>);
    return rows[0];
  }

  async create(input: CityCreateInput): Promise<City> {
    const name = String(input.name ?? "").trim();
    if (!name) throw new TypeError("City name is required");
    const now = new Date().toISOString();
    const city: City = {
      city_id: input.city_id ?? `city_${randomSecret(12)}`,
      name,
      status: "active",
      created_at: now,
      updated_at: now,
    };
    await this.table.insert(city);
    return city;
  }

  async setStatus(city_id: string, status: CityStatus): Promise<City> {
    if (status !== "active" && status !== "paused") {
      throw new TypeError(`Invalid city status: ${String(status)}`);
    }
    const existing = await this.get(city_id);
    if (!existing) throw new Error(`Unknown city: ${city_id}`);
    const next: City = { ...existing, status, updated_at: new Date().toISOString() };
    await this.table.update({ where: { city_id } as Partial<City>, values: next });
    return next;
  }

  async remove(city_id: string): Promise<void> {
    await this.table.delete({ city_id } as Partial<City>);
  }
}
