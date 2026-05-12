/**
 * city 公网 host 环境变量类型。
 *
 * 关键点（中文）
 * - `city start` 会自动探测公网 IP，并写入 Console Env。
 * - contact link 通过 Console Env 读取该值，避免 link code 回退到 localhost。
 */

/**
 * 公网 host 自动配置结果。
 */
export type CityPublicHostEnvResult =
  | {
      /**
       * 是否写入了新的环境变量。
       */
      changed: true;
      /**
       * 写入的环境变量名称。
       */
      key: "DOWNCITY_PUBLIC_HOST";
      /**
       * 写入的公网 host 值。
       */
      value: string;
    }
  | {
      /**
       * 是否写入了新的环境变量。
       */
      changed: false;
      /**
       * 未写入的原因。
       */
      reason: "configured" | "unavailable";
    };

/**
 * 写入 Console Env 的公网 host 条目。
 */
export interface CityPublicHostEnvEntry {
  /**
   * 环境变量名称。
   */
  key: "DOWNCITY_PUBLIC_HOST";
  /**
   * 公网 host 值。
   */
  value: string;
  /**
   * 环境变量说明。
   */
  description: string;
}

/**
 * city 公网 host 自动配置依赖。
 */
export interface EnsureCityPublicHostEnvInput {
  /**
   * 当前进程环境变量。
   */
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  /**
   * 读取 Console Env 全局变量。
   */
  readGlobalEnv?: () => Record<string, string>;
  /**
   * 公网 IPv4 解析器。
   */
  resolvePublicIpv4?: () => Promise<string | null> | string | null;
  /**
   * 写入 Console Env 全局变量。
   */
  upsertGlobalEnv?: (entry: CityPublicHostEnvEntry) => Promise<void>;
}
