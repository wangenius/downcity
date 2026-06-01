/**
 * `town city` 命令与 City 连接管理。
 *
 * 关键点（中文）
 * - Town 只负责连接 City：URL、town_id、user_token 进入平台 env，供 Agent runtime 使用。
 * - City 模型、服务、账号、计费等资源仍由 `city` CLI 管理。
 * - 优先复用 `city` CLI 的 server/session 配置，避免 Town 维护第二套 server 事实源。
 */
import type { Command } from "commander";
import type { TownCityConnectionState } from "../types/TownCityConnection.js";
export declare function readTownCityConnectionState(): TownCityConnectionState;
/**
 * 运行 `town city` 交互式管理器。
 */
export declare function runInteractiveCityManager(): Promise<void>;
/**
 * 注册 `town city` 命令组。
 */
export declare function registerCityConnectionCommand(program: Command): void;
//# sourceMappingURL=CityConnection.d.ts.map