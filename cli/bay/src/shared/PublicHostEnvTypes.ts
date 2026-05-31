/**
 * Bay 公网 host 环境变量类型。
 */

export type BayPublicHostEnvResult =
  | {
      /** 表示本次自动探测并写入了新的公网 host。 */
      changed: true;

      /** 写入的全局环境变量名。 */
      key: "DOWNCITY_PUBLIC_HOST";

      /** 写入的公网 host 值。 */
      value: string;
    }
  | {
      /** 表示本次没有写入新的公网 host。 */
      changed: false;

      /** 未写入的原因：已配置或当前环境无法探测。 */
      reason: "configured" | "unavailable";
    };

export interface BayPublicHostEnvEntry {
  /** 写入的全局环境变量名。 */
  key: "DOWNCITY_PUBLIC_HOST";

  /** 写入的公网 host 值。 */
  value: string;

  /** 给管理界面展示的变量说明。 */
  description: string;
}

export interface EnsureBayPublicHostEnvInput {
  /** 用于读取当前进程环境变量，测试时可注入。 */
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;

  /** 读取全局环境变量的函数，测试时可注入。 */
  readGlobalEnv?: () => Record<string, string>;

  /** 解析公网 IPv4 的函数，测试时可注入。 */
  resolvePublicIpv4?: () => Promise<string | null> | string | null;

  /** 写入全局环境变量的函数，测试时可注入。 */
  upsertGlobalEnv?: (entry: BayPublicHostEnvEntry) => Promise<void>;
}
