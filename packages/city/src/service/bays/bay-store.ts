/**
 * Bay 数据存储。
 *
 * 基于 CityTableApi，不直接依赖 Drizzle。
 */

import { randomSecret } from "../../utils/helpers.js";
import type { CityTableApi } from "../../store/table-api.js";
import type { Bay, BayCreateInput, BayStatus } from "./types.js";

export class BayStore {
  constructor(private table: CityTableApi<Bay>) {}

  async list(): Promise<Bay[]> {
    return this.table.select();
  }

  async get(bay_id: string): Promise<Bay | undefined> {
    const rows = await this.table.select({ bay_id } as Partial<Bay>);
    return rows[0];
  }

  async create(input: BayCreateInput): Promise<Bay> {
    const name = String(input.name ?? "").trim();
    if (!name) throw new TypeError("Bay name is required");
    const now = new Date().toISOString();
    const bay: Bay = {
      bay_id: input.bay_id ?? `bay_${randomSecret(12)}`,
      name,
      status: "active",
      created_at: now,
      updated_at: now,
    };
    await this.table.insert(bay);
    return bay;
  }

  async setStatus(bay_id: string, status: BayStatus): Promise<Bay> {
    if (status !== "active" && status !== "paused") {
      throw new TypeError(`Invalid bay status: ${String(status)}`);
    }
    const existing = await this.get(bay_id);
    if (!existing) throw new Error(`Unknown bay: ${bay_id}`);
    const next: Bay = { ...existing, status, updated_at: new Date().toISOString() };
    await this.table.update({ where: { bay_id } as Partial<Bay>, values: next });
    return next;
  }

  async remove(bay_id: string): Promise<void> {
    await this.table.delete({ bay_id } as Partial<Bay>);
  }
}
