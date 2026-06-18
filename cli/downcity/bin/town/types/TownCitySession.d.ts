/**
 * Town City user session 类型。
 *
 * 关键点（中文）
 * - 这些类型只描述 Town 本地 user 登录态。
 * - `city` CLI 的 admin 配置不使用这些类型。
 */
/**
 * Town 保存的 City user session。
 */
export interface TownCityUserSession {
    /**
     * City base 地址。
     */
    base_url: string;
    /**
     * 当前 user token 绑定的 town id。
     */
    city_id: string;
    /**
     * City 用户 ID。
     */
    user_id?: string;
    /**
     * 用户展示名称，例如 email 或 OAuth 标识。
     */
    user_label?: string;
    /**
     * City user token 明文。
     *
     * 说明（中文）
     * - 仅在 Town 本地加密存储中保存。
     * - CLI 状态输出只能展示是否存在，不输出明文。
     */
    user_token: string;
    /**
     * session 最后更新时间。
     */
    updated_at: string;
}
/**
 * Town City user 登录输入。
 */
export interface TownCityLoginInput {
    /**
     * City base 地址。
     */
    federation_url: string;
    /**
     * 登录后 session 使用的 town id。
     */
    city_id: string;
}
//# sourceMappingURL=TownCitySession.d.ts.map