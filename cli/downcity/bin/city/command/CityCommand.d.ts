/**
 * `city city` 命令装配模块。
 *
 * 关键点（中文）
 * - 所有 commander 注册逻辑统一放在 `src/command/`。
 * - City user 连接、登录和状态读写由 `shared/CityConnection` 提供。
 * - `city` CLI 只负责 admin/base 管理，`city city` 只负责 user login。
 */
import type { Command } from "commander";
/**
 * 注册 `city city` 命令组。
 */
export declare function registerCityConnectionCommand(program: Command): void;
//# sourceMappingURL=CityCommand.d.ts.map