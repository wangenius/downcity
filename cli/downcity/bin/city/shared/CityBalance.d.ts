/**
 * City City user 余额与充值流程。
 *
 * 关键点（中文）
 * - 只面向当前 City 已登录的 City user，不提供 admin 加款入口。
 * - 充值链路复用 City 的 balance topup 与 payment checkout 服务。
 * - 交互菜单只调用这里的高层函数，避免 CityConnection 模块继续膨胀。
 */
import type { CityBalanceAccount, CityRechargeInput, CityRechargeResult } from "../types/CityBalance.js";
/**
 * 读取当前 City City user 的余额。
 */
export declare function readCurrentCityBalance(): Promise<CityBalanceAccount>;
/**
 * 给当前 City City user 发起充值。
 */
export declare function rechargeCurrentCityUser(input: CityRechargeInput): Promise<CityRechargeResult>;
/**
 * 输出当前 user 余额。
 */
export declare function emitCurrentCityBalance(): Promise<void>;
/**
 * 输出当前 user 充值结果。
 */
export declare function emitCityRechargeResult(result: CityRechargeResult): void;
//# sourceMappingURL=CityBalance.d.ts.map