/**
 * Product 数据存储。
 *
 * 基于 InfraTableApi，不直接依赖 Drizzle。
 */

import { randomSecret } from "../../utils/helpers.js";
import type { InfraTableApi } from "../../store/table-api.js";
import type { Product, ProductCreateInput, ProductStatus } from "./types.js";

export class ProductStore {
  constructor(private table: InfraTableApi<Product>) {}

  async list(): Promise<Product[]> {
    return this.table.select();
  }

  async get(product_id: string): Promise<Product | undefined> {
    const rows = await this.table.select({ product_id } as Partial<Product>);
    return rows[0];
  }

  async create(input: ProductCreateInput): Promise<Product> {
    const name = String(input.name ?? "").trim();
    if (!name) throw new TypeError("Product name is required");
    const now = new Date().toISOString();
    const product: Product = {
      product_id: input.product_id ?? `prod_${randomSecret(12)}`,
      name,
      status: "active",
      created_at: now,
      updated_at: now,
    };
    await this.table.insert(product);
    return product;
  }

  async setStatus(product_id: string, status: ProductStatus): Promise<Product> {
    if (status !== "active" && status !== "paused") {
      throw new TypeError(`Invalid product status: ${String(status)}`);
    }
    const existing = await this.get(product_id);
    if (!existing) throw new Error(`Unknown product: ${product_id}`);
    const next: Product = { ...existing, status, updated_at: new Date().toISOString() };
    await this.table.update({ where: { product_id } as Partial<Product>, values: next });
    return next;
  }

  async remove(product_id: string): Promise<void> {
    await this.table.delete({ product_id } as Partial<Product>);
  }
}
