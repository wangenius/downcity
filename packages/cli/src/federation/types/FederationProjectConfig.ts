/**
 * City 项目部署配置类型。
 *
 * 关键点（中文）
 * - `federation.json` 是可提交的 Downcity 部署意图声明。
 * - Cloudflare account、database id、Worker URL 等部署状态不进入项目配置。
 * - `resources.d1` / `resources.queue` 保存稳定资源名称，Wrangler 配置仍由 CLI 临时生成。
 */

/** City 项目当前支持的部署目标类型。 */
export type FederationProjectTarget = "cloudflare-workers";

/** City 项目当前支持的项目类型。 */
export type FederationProjectType = "city";

/** City 项目 D1 资源配置。 */
export interface FederationProjectD1ResourceConfig {
  /** 数据库运行时类型，当前支持 Cloudflare D1。 */
  type: "d1";
  /** Worker runtime 中的数据库 binding 名称，默认 `DB`。 */
  binding: string;
  /** Cloudflare D1 数据库名称。 */
  name: string;
}

/** City 项目 Queue 资源配置。 */
export interface FederationProjectQueueResourceConfig {
  /** 队列运行时类型，当前支持 Cloudflare Queues。 */
  type: "queue";
  /** Worker runtime 中的 Queue binding 名称。 */
  binding: string;
  /** Cloudflare Queue 名称。 */
  name: string;
}

/** City 项目默认存储资源配置。 */
export interface FederationProjectStorageResourceConfig {
  /** 存储运行时类型，当前支持 Cloudflare R2。 */
  type: "r2";
  /** Worker runtime 中的存储 binding 名称，默认 `DOWNCITY_STORAGE`。 */
  binding: string;
  /** Cloudflare R2 bucket 名称。 */
  name: string;
  /** R2 bucket 的公开访问前缀，例如 `https://images.example.com`。 */
  public_url_prefix: string;
}

/** City 项目资源配置。 */
export interface FederationProjectResourcesConfig {
  /** Cloudflare Workers 目标使用的 D1 数据库资源。 */
  d1?: FederationProjectD1ResourceConfig;
  /** Cloudflare Workers 目标使用的 Queue 资源。 */
  queue?: FederationProjectQueueResourceConfig;
  /** Cloudflare Workers 目标使用的默认存储资源。 */
  storage?: FederationProjectStorageResourceConfig;
}

/** `city.json` 解析后的配置结构。 */
export interface FederationProjectConfig {
  /** 配置 schema 版本，当前为 1。 */
  schema: 1;
  /** Downcity 项目类型，当前为 `city`。 */
  type: FederationProjectType;
  /** City 项目名称，用于默认 Worker 名称和 CLI 输出。 */
  name: string;
  /** City Worker 入口文件路径，相对项目根目录。 */
  entry: string;
  /** City 项目部署目标，例如 `cloudflare-workers`。 */
  target: FederationProjectTarget;
  /** City 项目声明的稳定资源。 */
  resources: FederationProjectResourcesConfig;
}

/** 已读取并解析完成的 City 项目配置文件。 */
export interface FederationProjectConfigFile {
  /** City 项目根目录。 */
  project_dir: string;
  /** `city.json` 的绝对路径。 */
  config_path: string;
  /** 解析后的 City 项目配置。 */
  config: FederationProjectConfig;
}

/** 已解析的部署目标。 */
export interface FederationDeployTarget {
  /** 部署目标目录。 */
  project_dir: string;
  /** 原始部署目标文本。 */
  source: string;
  /** 部署目标是否为本地目录。 */
  local: boolean;
}

/** `city deploy` 命令的执行选项。 */
export interface FederationDeployOptions {
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
