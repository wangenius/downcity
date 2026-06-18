/**
 * Federation 初始化模块。
 *
 * 负责组装表、执行建表、挂载 env store、初始化 authenticator，
 * 并把 runtime 依赖注入到各个 service。
 */

import { executeDDL } from "../../store/db.js";
import { TableApi, buildCreateUserTableSQL, type CityTableApi } from "../../store/table-api.js";
import { EnvStore } from "../../service/env/env-store.js";
import { CityStore } from "../../service/cities/city-store.js";
import { Authenticator } from "../auth/authenticator.js";
import { randomSecret } from "../../utils/helpers.js";
import type { Service } from "../../service/service.js";
import type { CityUserSchemaInput } from "../../store/types.js";
import type { Runtime } from "../runtime.js";
import type { City } from "../../service/cities/types.js";
import type { EnvEntry } from "../../service/env/types.js";
import type { Database, DbClient } from "../../store/db.js";

/**
 * Federation 初始化后的内部状态。
 */
export interface FederationInitState {
  /** 初始化后的 database */
  database: Database;
  /** 初始化后的底层 client */
  client: { $client: DbClient };
  /** 所有表 API 映射 */
  table_map: Map<string, CityTableApi>;
  /** city store */
  city_store: CityStore;
  /** 鉴权器 */
  authenticator: Authenticator;
}

/**
 * 执行 Federation 初始化。
 */
export async function initialize_federation(params: {
  /** runtime 能力 */
  runtime: Runtime;
  /** 已注册服务 */
  services: Service[];
  /** City ready 回调 */
  require_ready: () => Promise<{ city: { get(id: string): Promise<{ city_id: string; status: string } | undefined> } }>;
}): Promise<FederationInitState> {
  const { runtime, services, require_ready } = params;
  const { database, client, env, builtinTables } = runtime;

  const user_schema = collect_service_schemas(services);
  const table_map = new Map<string, CityTableApi>();
  table_map.set("cities", new TableApi(database, builtinTables.cities));
  table_map.set("env", new TableApi(database, builtinTables.env));

  for (const [name, table] of Object.entries(user_schema)) {
    table_map.set(name, new TableApi(database, table));
  }

  const db_client = { $client: client };
  for (const table of table_map.values()) {
    const ddl = buildCreateUserTableSQL(table.schema);
    if (ddl) await executeDDL(db_client, ddl);
  }

  const env_table = table_map.get("env");
  if (!env_table) throw new Error("Federation env table is not initialized");
  const env_store = new EnvStore(env_table as CityTableApi<EnvEntry>);
  await env.attachStore(env_store);

  const cities_table = table_map.get("cities");
  if (!cities_table) throw new Error("City cities table is not initialized");
  const city_store = new CityStore(cities_table as CityTableApi<City>);

  const configured_base_url = env.get("DOWNCITY_FEDERATION_BASE_URL")
    ?? env.get("BETTER_AUTH_URL")
    ?? runtime.baseURL
    ?? "http://localhost";

  await bootstrap_default_keys(env);

  const authenticator = new Authenticator(env, require_ready);

  for (const service of services) {
    service._db = database;
    service._client = db_client;
    service._authenticator = authenticator;
    service._env = env;
    service._cityStore = city_store;
    service._raw = runtime.raw;
    service._baseURL = configured_base_url ?? runtime.baseURL;
    await service._onInit();
  }

  return {
    database,
    client: db_client,
    table_map,
    city_store,
    authenticator,
  };
}

/**
 * 收集所有 service 声明的业务表。
 */
function collect_service_schemas(services: Service[]): CityUserSchemaInput {
  const collected: CityUserSchemaInput = {};
  for (const service of services) {
    const tables = service.tables ?? (service as { schema?: Record<string, unknown> }).schema;
    if (!tables) continue;
    for (const [name, table] of Object.entries(tables)) {
      const scoped_name = `${service.id}.${name}`;
      if (collected[scoped_name]) {
        throw new Error(`Duplicate schema table "${scoped_name}" from services: ${service.id}`);
      }
      collected[scoped_name] = table as never;
    }
  }
  return collected;
}

/**
 * 确保 Federation 系统级 env key 存在。
 *
 * 关键说明（中文）
 * - 系统密钥也统一走 Federation env 表托管
 * - 缺失时自动生成，避免宿主环境额外配置负担
 */
async function bootstrap_default_keys(
  env: { get(key: string): string | undefined; upsert(input: { key: string; value: string }): Promise<unknown> },
): Promise<void> {
  const admin_key = env.get("DOWNCITY_FEDERATION_ADMIN_SECRET_KEY") || `admin_${randomSecret()}`;
  if (!env.get("DOWNCITY_FEDERATION_ADMIN_SECRET_KEY")) {
    await env.upsert({ key: "DOWNCITY_FEDERATION_ADMIN_SECRET_KEY", value: admin_key });
  }

  const token_key = env.get("DOWNCITY_FEDERATION_TOKEN_SIGNING_KEY") || `sign_${randomSecret()}`;
  if (!env.get("DOWNCITY_FEDERATION_TOKEN_SIGNING_KEY")) {
    await env.upsert({ key: "DOWNCITY_FEDERATION_TOKEN_SIGNING_KEY", value: token_key });
  }

  const better_auth_secret = env.get("BETTER_AUTH_SECRET") || `better_auth_${randomSecret()}${randomSecret()}`;
  if (!env.get("BETTER_AUTH_SECRET")) {
    await env.upsert({ key: "BETTER_AUTH_SECRET", value: better_auth_secret });
  }
}
