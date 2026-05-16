/**
 * city 公网 host 环境变量类型。
 */

export type CityPublicHostEnvResult =
  | {
      changed: true;
      key: "DOWNCITY_PUBLIC_HOST";
      value: string;
    }
  | {
      changed: false;
      reason: "configured" | "unavailable";
    };

export interface CityPublicHostEnvEntry {
  key: "DOWNCITY_PUBLIC_HOST";
  value: string;
  description: string;
}

export interface EnsureCityPublicHostEnvInput {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  readGlobalEnv?: () => Record<string, string>;
  resolvePublicIpv4?: () => Promise<string | null> | string | null;
  upsertGlobalEnv?: (entry: CityPublicHostEnvEntry) => Promise<void>;
}
