/**
 * Credits 金额类型。
 *
 * 关键说明（中文）
 * - 对用户展示的 1 credit 等价于 1 USD
 * - 数据库与账务计算统一使用 microcredits 整数，避免浮点误差
 * - 1 credit = 1_000_000 microcredits
 */

/**
 * 一个 credit 对应的 microcredits 数量。
 */
export const MICROCREDITS_PER_CREDIT = 1_000_000;

/**
 * Credits 小数精度。
 */
export const CREDIT_DECIMAL_PLACES = 6;

/**
 * 以 microcredits 表示的账务金额。
 */
export type Microcredits = number;

/**
 * 用户可理解的 credits 金额。
 */
export type Credits = number;

