/**
 * Studio 数据存储。
 *
 * 基于 CityTableApi，不直接依赖 Drizzle。
 */

import { randomSecret } from "../../utils/helpers.js";
import type { CityTableApi } from "../../store/table-api.js";
import type { Studio, StudioCreateInput, StudioStatus } from "./types.js";

export class StudioStore {
  constructor(private table: CityTableApi<Studio>) {}

  async list(): Promise<Studio[]> {
    return this.table.select();
  }

  async get(studio_id: string): Promise<Studio | undefined> {
    const rows = await this.table.select({ studio_id } as Partial<Studio>);
    return rows[0];
  }

  async create(input: StudioCreateInput): Promise<Studio> {
    const name = String(input.name ?? "").trim();
    if (!name) throw new TypeError("Studio name is required");
    const now = new Date().toISOString();
    const studio: Studio = {
      studio_id: input.studio_id ?? `studio_${randomSecret(12)}`,
      name,
      status: "active",
      created_at: now,
      updated_at: now,
    };
    await this.table.insert(studio);
    return studio;
  }

  async setStatus(studio_id: string, status: StudioStatus): Promise<Studio> {
    if (status !== "active" && status !== "paused") {
      throw new TypeError(`Invalid studio status: ${String(status)}`);
    }
    const existing = await this.get(studio_id);
    if (!existing) throw new Error(`Unknown studio: ${studio_id}`);
    const next: Studio = { ...existing, status, updated_at: new Date().toISOString() };
    await this.table.update({ where: { studio_id } as Partial<Studio>, values: next });
    return next;
  }

  async remove(studio_id: string): Promise<void> {
    await this.table.delete({ studio_id } as Partial<Studio>);
  }
}
