/**
 * City 项目部署配置类型。
 *
 * 关键点（中文）
 * - `city.json` 是开发者手写的最小项目声明。
 * - `.env` 只保存 City 项目自身真正需要的部署输入，例如 D1 name。
 * - 配置里不放 Cloudflare token、provider key 或过细的 Worker 选项。
 */
/** City 项目当前支持的部署目标类型。 */
export type FederationProjectTarget = "cloudflare-workers";
/** City 项目当前支持的项目类型。 */
export type FederationProjectType = "city";
/** City 项目内部解析出的数据库配置。 */
export interface FederationProjectDatabaseConfig {
    /** 数据库运行时类型，当前支持 Cloudflare D1。 */
    type: "d1";
    /** Worker runtime 中的数据库 binding 名称，默认 `DB`。 */
    binding: string;
    /** Cloudflare D1 数据库名称，默认 `${name}-db`。 */
    name: string;
}
/** `city.json` 解析后的配置结构。 */
export interface FederationProjectConfig {
    /** Downcity 项目类型，当前为 `city`。 */
    type: FederationProjectType;
    /** City 项目名称，用于默认 Worker 名称和 CLI 输出。 */
    name: string;
    /** CLI 根据 target 推导出的入口文件。 */
    entry: string;
    /** City 项目部署目标，例如 `cloudflare-workers`。 */
    target: FederationProjectTarget;
    /** CLI 根据 target 推导出的数据库配置。 */
    database?: FederationProjectDatabaseConfig;
}
/** City 项目本地部署环境。 */
export interface FederationProjectDeployEnv {
    /** Cloudflare D1 database name。 */
    city_d1_database_name?: string;
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
/** 已读取并解析完成的 City 本地部署环境文件。 */
export interface FederationProjectDeployEnvFile {
    /** `.env` 的绝对路径。 */
    env_path: string;
    /** 当前部署环境。 */
    env: FederationProjectDeployEnv;
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
//# sourceMappingURL=FederationProjectConfig.d.ts.map