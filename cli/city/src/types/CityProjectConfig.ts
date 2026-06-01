/**
 * City 项目部署配置类型。
 *
 * 关键点（中文）
 * - `city.json` 是开发者手写的最小项目声明。
 * - `.city/deploy.json` 保存 CLI 生成的远端资源状态。
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

/** City 项目部署状态。 */
export interface CityProjectDeployState {
  /** Cloudflare 部署状态，只保存资源 ID 和公开 URL。 */
  cloudflare?: {
    /** Cloudflare account id，用于后续部署复用，不属于密钥。 */
    account_id?: string;
    /** Cloudflare D1 database id。 */
    database_id?: string;
    /** Worker 公开访问地址。 */
    worker_url?: string;
  };
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

/** 已读取并解析完成的 City 部署状态文件。 */
export interface CityProjectDeployStateFile {
  /** `.city/deploy.json` 的绝对路径。 */
  state_path: string;
  /** 当前部署状态。 */
  state: CityProjectDeployState;
}

/** 已解析的部署目标。 */
export interface CityDeployTarget {
  /** 部署目标目录。 */
  project_dir: string;
  /** 原始部署目标文本。 */
  source: string;
  /** 部署目标是否来自远程 Git。 */
  remote: boolean;
  /** 清理远程临时目录的回调。 */
  cleanup?: () => Promise<void>;
}

/** `city deploy` 命令的执行选项。 */
export interface CityDeployOptions {
  /** 用户传入的部署目标，可以是空值、`.`、本地目录或 Git URL。 */
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
