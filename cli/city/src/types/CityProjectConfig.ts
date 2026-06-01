/**
 * City 项目部署配置类型。
 *
 * 关键点（中文）
 * - `city.json` 是开发者手写的最小项目声明。
 * - `.env` 保存本地部署绑定，例如 Cloudflare account、D1 name 和 Worker URL。
 * - 配置里不放 Cloudflare token、provider key 或过细的 Worker 选项。
 */

/** City 项目当前支持的部署目标类型。 */
export type CityProjectTarget = "cloudflare-workers";

/** City 项目当前支持的项目类型。 */
export type CityProjectType = "city";

/** City 项目内部解析出的数据库配置。 */
export interface CityProjectDatabaseConfig {
  /** 数据库运行时类型，当前支持 Cloudflare D1。 */
  type: "d1";
  /** Worker runtime 中的数据库 binding 名称，默认 `DB`。 */
  binding: string;
  /** Cloudflare D1 数据库名称，默认 `${name}-db`。 */
  name: string;
}

/** `city.json` 解析后的配置结构。 */
export interface CityProjectConfig {
  /** Downcity 项目类型，当前为 `city`。 */
  type: CityProjectType;
  /** City 项目名称，用于默认 Worker 名称和 CLI 输出。 */
  name: string;
  /** CLI 根据 target 推导出的入口文件。 */
  entry: string;
  /** City 项目部署目标，例如 `cloudflare-workers`。 */
  target: CityProjectTarget;
  /** CLI 根据 target 推导出的数据库配置。 */
  database?: CityProjectDatabaseConfig;
}

/** City 项目本地部署环境。 */
export interface CityProjectDeployEnv {
  /** Cloudflare account id，用于后续部署复用，不属于密钥。 */
  cloudflare_account_id?: string;
  /** Worker 公开访问地址，用于部署后验证与客户端连接。 */
  city_worker_url?: string;
  /** Cloudflare D1 database name。 */
  city_d1_database_name?: string;
  /** Worker runtime 中的 D1 binding 名称。 */
  city_d1_binding?: string;
}

/** 已读取并解析完成的 City 项目配置文件。 */
export interface CityProjectConfigFile {
  /** City 项目根目录。 */
  project_dir: string;
  /** `city.json` 的绝对路径。 */
  config_path: string;
  /** 解析后的 City 项目配置。 */
  config: CityProjectConfig;
}

/** 已读取并解析完成的 City 本地部署环境文件。 */
export interface CityProjectDeployEnvFile {
  /** `.env` 的绝对路径。 */
  env_path: string;
  /** 当前部署环境。 */
  env: CityProjectDeployEnv;
}

/** 已解析的部署目标。 */
export interface CityDeployTarget {
  /** 部署目标目录。 */
  project_dir: string;
  /** 原始部署目标文本。 */
  source: string;
  /** 部署目标是否为本地目录。 */
  local: boolean;
}

/** `city deploy` 命令的执行选项。 */
export interface CityDeployOptions {
  /** 用户传入的部署目标，可以是空值、`.` 或本地目录。 */
  source: string;
  /** 是否只执行 Wrangler dry-run。 */
  dry_run: boolean;
  /** 是否只执行线上健康检查。 */
  verify_only: boolean;
  /** 是否在部署后执行健康检查。 */
  verify: boolean;
  /** 是否跳过 package.json build。 */
  skip_build: boolean;
  /** 是否跳过 package.json typecheck。 */
  skip_typecheck: boolean;
  /** 本次部署显式使用的 Cloudflare account id。 */
  account_id?: string;
}
