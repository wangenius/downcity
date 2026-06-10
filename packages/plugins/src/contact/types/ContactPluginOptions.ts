/**
 * ContactPluginOptions：ContactPlugin 构造参数。
 *
 * 关键点（中文）
 * - 这里只保留 agent 运行时真正需要的显式配置。
 * - contact token、link secret 等协议密钥都由运行时自动生成，不从 constructor 传入。
 */

/**
 * ContactPlugin 构造参数。
 */
export interface ContactPluginOptions {
  /**
   * 当前 agent 对外可访问的 HTTP endpoint。
   *
   * 说明（中文）
   * - 传入后会优先写入 `contact link` 生成的一次性联系码。
   * - 适合反向代理、tunnel、公网域名等自动探测不可靠的环境。
   */
  endpoint?: string;

  /**
   * 默认 link 有效秒数。
   *
   * 说明（中文）
   * - `contact link` action 没有显式传 `ttlSeconds` 时使用该值。
   * - 最终运行时仍会强制不少于 60 秒，避免生成过短的人工转交 code。
   */
  ttlSeconds?: number;
}
