/**
 * Town 与 City 连接状态类型。
 *
 * 关键点（中文）
 * - Town 只保存“连接哪个 City、用哪个 town/user token 调用”的宿主上下文。
 * - City 内部资源（模型、服务、账号、计费）仍由 `city` CLI 管理。
 */
/**
 * City CLI 中保存的 server 配置摘要。
 */
export interface TownCityServerProfile {
    /**
     * server 展示名称。
     *
     * 说明（中文）
     * - 来自 `city` CLI 的 `~/.downcity/config.json`。
     * - 若未显式设置，通常回退为 URL hostname。
     */
    name: string;
    /**
     * City 服务基础地址。
     *
     * 说明（中文）
     * - 已做基础规范化，末尾不带多余 `/`。
     * - Town runtime 会通过该地址访问 City AIService 等用户态能力。
     */
    base_url: string;
    /**
     * 是否是 `city` CLI 当前激活的 server。
     */
    active: boolean;
    /**
     * 该 server 是否保存了 admin secret key。
     *
     * 说明（中文）
     * - 这里只展示存在性，不暴露密钥明文。
     * - Town 不使用它管理 City 模型或服务资源。
     */
    has_admin_secret_key: boolean;
    /**
     * 该 server 是否已有 user session。
     *
     * 说明（中文）
     * - 若为 true，`town city use` 可导入 user token 给本机 Agent runtime 使用。
     */
    has_user_session: boolean;
    /**
     * user session 中绑定的 town id。
     *
     * 说明（中文）
     * - 为空表示未登录或 session 文件不可用。
     */
    town_id?: string;
    /**
     * user session 中的用户 id。
     *
     * 说明（中文）
     * - 只用于状态展示，不参与权限判断。
     */
    user_id?: string;
}
/**
 * Town 当前写入平台 env 的 City 连接状态。
 */
export interface TownCityConnectionState {
    /**
     * 当前 Town runtime 使用的 City 服务基础地址。
     */
    city_url: string;
    /**
     * 当前 Town runtime 使用的 City town id。
     */
    town_id: string;
    /**
     * 是否已保存 user token。
     *
     * 说明（中文）
     * - 这里只展示存在性，不输出 token 明文。
     * - Agent runtime 缺少 user token 时无法调用 City 用户态服务。
     */
    has_user_token: boolean;
    /**
     * 连接来源。
     *
     * 说明（中文）
     * - `town-env` 表示由 `town city connect/use` 写入平台 env。
     * - `city-cli` 表示只发现了 city CLI server，但尚未导入到 Town 平台 env。
     * - `missing` 表示没有可用连接。
     */
    source: "town-env" | "city-cli" | "missing";
}
//# sourceMappingURL=TownCityConnection.d.ts.map