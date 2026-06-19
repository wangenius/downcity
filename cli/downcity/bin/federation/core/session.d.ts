/**
 * Session 与 server 配置持久化模块。
 *
 * 关键说明（中文）
 * - server 是一等资源，必须显式配置后 CLI 才进入 admin 工作区
 * - 不再注入默认 server；没有 server 时必须先添加
 * - user session 由 `city` 维护，`city` 不再保存 user token
 * - admin_secret_key 直接属于 server 配置，不再作为独立 session 维护
 */
import type { CliLocale } from "../../shared/types/CliLocale.js";
export interface AdminSession {
    /** 当前 server 的 server URL */
    base_url: string;
    /** 当前 server 的 admin secret key */
    admin_secret_key: string;
}
export interface ServerProfile {
    /** 展示名称 */
    name: string;
    /** City 服务地址 */
    base_url: string;
    /** 该 server 对应的 admin secret key */
    admin_secret_key: string;
}
export interface ClientConfig {
    /** 当前激活的 server URL */
    active_server_url?: string;
    /** 已保存的 server 列表 */
    servers: ServerProfile[];
    /** 当前 Cloudflare account id，属于 CLI 本地 provider 状态。 */
    cloudflare_account_id?: string;
    /** 当前选择的模型 ID */
    model: string;
    /** 当前持久化的 CLI 语言。 */
    cli_locale?: CliLocale;
}
/**
 * 从磁盘读取 config。
 */
export declare function readConfig(): ClientConfig;
/**
 * 写入 config 到磁盘。
 */
export declare function writeConfig(config: ClientConfig): void;
/**
 * 读取持久化的 CLI 语言。
 */
export declare function readPersistedCliLocale(): CliLocale | undefined;
/**
 * 写入持久化的 CLI 语言。
 */
export declare function writePersistedCliLocale(cli_locale: CliLocale): void;
/**
 * 读取当前保存的 Cloudflare account id。
 */
export declare function readCloudflareAccountId(): string | undefined;
/**
 * 写入当前 Cloudflare account id。
 */
export declare function writeCloudflareAccountId(account_id: string): void;
/**
 * 读取当前激活的 server。
 */
export declare function readActiveServer(): ServerProfile | undefined;
/**
 * 设置当前激活的 server。
 */
export declare function setActiveServer(baseUrl: string): void;
/**
 * 添加 server，并设为当前激活 server。
 */
export declare function addServer(input: {
    base_url: string;
    admin_secret_key?: string;
    name?: string;
}): ServerProfile;
/**
 * 更新已存在的 server。
 *
 * 关键说明（中文）
 * - active server 会自动切换到新 URL
 */
export declare function updateServer(currentBaseUrl: string, input: {
    base_url: string;
    admin_secret_key?: string;
    name?: string;
}): ServerProfile;
/**
 * 删除 server。
 */
export declare function removeServer(baseUrl: string): void;
/**
 * 根据 URL 读取 server。
 */
export declare function readServer(baseUrl: string): ServerProfile | undefined;
//# sourceMappingURL=session.d.ts.map