/**
 * Bay 公网 host 环境变量类型。
 */

export type StudioPublicHostEnvResult =
  | {
      changed: true;
      key: "DOWNCITY_PUBLIC_HOST";
      value: string;
    }
  | {
      changed: false;
      reason: "configured" | "unavailable";
    };

export interface StudioPublicHostEnvEntry {
  key: "DOWNCITY_PUBLIC_HOST";
  value: string;
  description: string;
}

export interface EnsureStudioPublicHostEnvInput {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  readGlobalEnv?: () => Record<string, string>;
  resolvePublicIpv4?: () => Promise<string | null> | string | null;
  upsertGlobalEnv?: (entry: StudioPublicHostEnvEntry) => Promise<void>;
}
