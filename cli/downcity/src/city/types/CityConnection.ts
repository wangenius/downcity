/**
 * City 与 City user 连接状态类型。
 *
 * 关键点（中文）
 * - `city` CLI 只作为 admin/base 管理入口。
 * - `city` CLI 自己维护 user base 选择与 user session。
 * - City 可以只读发现 `city` CLI 保存的 base 地址，但不读取 admin 密钥或 user token。
 */

/**
 * City 可选择的 City base 配置摘要。
 */
export interface CityServerProfile {
  /**
   * base 展示名称。
   *
   * 说明（中文）
   * - 可能来自 City 本地配置、默认 base，或 `city` CLI 的 admin base 列表。
   * - 若未显式设置，通常回退为 URL hostname。
   */
  name: string;

  /**
   * City base 服务地址。
   *
   * 说明（中文）
   * - 已做基础规范化，末尾不带多余 `/`。
   * - City runtime 会通过该地址访问 City AIService 等用户态能力。
   */
  base_url: string;

  /**
   * 是否是当前 City 选择的 base。
   */
  selected: boolean;

  /**
   * base 来源。
   */
  source: "city" | "city-admin" | "default";

  /**
   * 该 base 是否由 `city` CLI 保存了 admin secret key。
   *
   * 说明（中文）
   * - 这里只展示存在性，不暴露密钥明文。
   * - City 不使用它管理 City 模型或服务资源。
   */
  has_admin_secret_key: boolean;

  /**
   * 该 base 是否已有 City user session。
   *
   * 说明（中文）
   * - user session 由 City 自己维护，不从 `city` CLI 导入。
   */
  has_user_session: boolean;

  /**
   * City user session 中绑定的 city id。
   *
   * 说明（中文）
   * - 为空表示未登录或 session 文件不可用。
   */
  city_id?: string;

  /**
   * City user session 中的用户 id。
   *
   * 说明（中文）
   * - 只用于状态展示，不参与权限判断。
   */
  user_id?: string;
}

/**
 * City 当前 City user 连接状态。
 */
export interface CityConnectionState {
  /**
   * 当前 City 选择的 City base 地址。
   */
  federation_url: string;

  /**
   * 当前 City user session 使用的 City city id。
   */
  city_id: string;

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
   * - `city-session` 表示 City 已在当前 base 登录 user。
   * - `city-base` 表示 City 已选择 base，但尚未登录 user。
   * - `city-admin` 表示当前 base 来自 `city` CLI 的 admin base 候选。
   * - `default` 表示使用默认 base。
   * - `missing` 表示没有可用连接。
   */
  source: "city-session" | "city-base" | "city-admin" | "default" | "missing";

  /**
   * 当前登录用户 ID。
   */
  user_id?: string;

  /**
   * 当前登录用户展示名称。
   */
  user_label?: string;
}
