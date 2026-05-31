/**
 * City 主模块。
 *
 * City 是城市基础设施运行容器，负责协调：
 * - service 注册
 * - runtime 初始化
 * - 鉴权器访问
 * - HTTP 路由暴露
 *
 * 具体初始化、路由构建、instruction 聚合等实现已拆到独立模块。
 */

import type { Hono } from "hono";
import { Service } from "../../service/service.js";
import { asInstallableService, type ServiceDefinition } from "../../service/installable-service.js";
import { EnvService } from "../../service/env/env-service.js";
import { BaysService } from "../../service/bays/bays-service.js";
import { build_city_instruction } from "./base-instruction.js";
import { initialize_city } from "./base-init.js";
import { build_city_router } from "./base-router.js";
import { create_runtime_from_db } from "./base-runtime.js";
import type { CityOptions, CityHealthStatus } from "../types.js";
import type { Authenticator } from "../auth/authenticator.js";
import type { Runtime } from "../runtime.js";
import type { CityTableApi } from "../../store/table-api.js";
import type { BayStore } from "../../service/bays/bay-store.js";
import type { Database, DbClient } from "../../store/db.js";

export class City {
  private readonly runtime: Runtime;
  private readonly services = new Map<string, Service>();

  private database?: Database;
  private client?: { $client: DbClient };
  private table_map?: Map<string, CityTableApi>;
  private init_promise?: Promise<void>;
  private hono?: Hono;
  private authenticator?: Authenticator;
  private bay_store?: BayStore;

  constructor(options: CityOptions) {
    this.runtime = options.runtime ?? create_runtime_from_db(options);
    this.use(new EnvService());
    this.use(new BaysService());
  }

  /**
   * 注册 service。
   */
  use(service_input: Service | ServiceDefinition): this {
    const service = "install" in service_input && !("get" in service_input)
      ? asInstallableService(service_input)
      : service_input;
    this.services.set((service as Service).id, service as Service);
    return this;
  }

  /**
   * 获取单个 service。
   */
  getService(id: string): Service | undefined {
    return this.services.get(id);
  }

  /**
   * 获取所有已注册 service。
   */
  getServices(): Service[] {
    return [...this.services.values()];
  }

  /**
   * 获取鉴权器。
   */
  async getAuthenticator(): Promise<Authenticator> {
    await this.ensure_ready();
    return this.authenticator!;
  }

  /**
   * 获取表 API。
   */
  async table<TRow extends Record<string, unknown> = Record<string, unknown>>(
    name: string,
  ): Promise<CityTableApi<TRow>> {
    await this.ensure_ready();
    const api = this.table_map?.get(name);
    if (!api) throw new Error(`Unknown schema table: ${name}`);
    return api as CityTableApi<TRow>;
  }

  /**
   * 返回已构建好的 Hono router。
   */
  router(): Hono {
    this.require_ready_sync();
    return this.hono!;
  }

  /**
   * 处理 HTTP 请求。
   */
  async handleRequest(request: Request): Promise<Response> {
    await this.ensure_ready();
    return this.hono!.fetch(request);
  }

  /**
   * 健康检查。
   */
  async health(): Promise<CityHealthStatus> {
    await this.ensure_ready();
    const services = this.getServices();
    return {
      ok: true,
      name: "downcity",
      checked_at: new Date().toISOString(),
      services: services.map((service) => service.id),
      service_list: services.map((service) => ({ id: service.id, name: service.name })),
    };
  }

  /**
   * 聚合 instruction 文档。
   */
  async instruction(): Promise<string> {
    await this.ensure_ready();
    return build_city_instruction(this.getServices());
  }

  /**
   * 执行 City 初始化。
   */
  private async initialize(): Promise<void> {
    const state = await initialize_city({
      runtime: this.runtime,
      services: this.getServices(),
      require_ready: () => this.require_ready(),
    });

    this.database = state.database;
    this.client = state.client;
    this.table_map = state.table_map;
    this.bay_store = state.bay_store;
    this.authenticator = state.authenticator;
    this.hono = build_city_router({
      runtime: this.runtime,
      services: this.getServices(),
      authenticator: state.authenticator,
      table_map: state.table_map,
    });
  }

  /**
   * 确保初始化完成。
   */
  private async ensure_ready(): Promise<void> {
    if (!this.init_promise) {
      this.init_promise = this.initialize();
    }
    await this.init_promise;
  }

  /**
   * 同步要求初始化完成。
   */
  private require_ready_sync(): void {
    if (!this.hono) {
      throw new Error("City init has not completed yet");
    }
  }

  /**
   * 给 Authenticator 延迟访问 bay store。
   */
  private async require_ready(): Promise<{
    bay: { get(id: string): Promise<{ bay_id: string; status: string } | undefined> };
  }> {
    await this.ensure_ready();
    return {
      bay: this.bay_store ?? { get: () => Promise.resolve(undefined) },
    };
  }
}
