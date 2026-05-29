/**
 * @downcity/city 公共入口。
 */

// ===========================================================================
// 场景 1：创建 City 实例
// ===========================================================================

export { City } from "./core/base/base.js";
export type { CityOptions, CityHealthStatus } from "./core/types.js";
export type { Runtime, EnvProvider, BuiltinTables, TableDef } from "./core/runtime.js";

// ===========================================================================
// 场景 2：注册 Service / InstallableService / AI 模型
// ===========================================================================

export { Service } from "./service/service.js";
export { InstallableService } from "./service/installable-service.js";
export { Action } from "./service/action.js";

export type {
  Context,
  RouteAuth,
  EnvRequirement,
} from "./service/service.js";

export type {
  ActionFn,
  HookFn,
} from "./service/action.js";

export type {
  ServiceDefinition,
  ServiceInstallContext,
  ServiceRouteContext,
} from "./service/installable-service.js";

export type {
  InstructionDefinition,
  InstructionContext,
  InstructionActionDefinition,
  InstructionCapable,
} from "./service/instruction.js";

export { AIService } from "./service/ai/ai-service.js";
export { Provider } from "./service/ai/provider.js";
export { createOpenAICompatibleProvider } from "./service/ai/openai-compatible-provider.js";

export type {
  ModelConfig,
  ModelActions,
  PublicModel,
} from "./service/ai/types.js";

export type {
  OpenAICompatibleClient,
  OpenAICompatibleClientConfig,
  OpenAICompatibleClientFactory,
  OpenAICompatibleProviderOptions,
} from "./service/ai/openai-compatible-provider.js";

// ===========================================================================
// 场景 3：用户鉴权与 Token
// ===========================================================================

export { TokenSigner } from "./core/auth/token-signer.js";

export type {
  RuntimeUser,
  CreateUserTokenInput,
  UserTokenPayload,
  UserTokenIssueResult,
} from "./core/auth/types.js";

// ===========================================================================
// 场景 4：管理 Studio 与环境变量（内置 Service）
// ===========================================================================

export { EnvService } from "./service/env/env-service.js";
export type {
  EnvEntry,
  EnvUpsertInput,
  EnvRequirementStatus,
  EnvCatalogScope,
} from "./service/env/types.js";
export { EnvStore } from "./service/env/env-store.js";

export { StudiosService } from "./service/studios/studios-service.js";
export type { Studio, StudioCreateInput, StudioStatus } from "./service/studios/types.js";

// ===========================================================================
// 场景 5：数据库工具
// ===========================================================================

export type { Database, DbClient } from "./store/db.js";
export { executeDDL } from "./store/db.js";
export type { CityTableApi } from "./store/table-api.js";
export type { CityUserSchemaInput } from "./store/types.js";

// ===========================================================================
// 场景 6：内置表 Schema
// ===========================================================================

export { sqliteStudios, pgStudios } from "./service/studios/schema.js";
export { sqliteEnv, pgEnv } from "./service/env/schema.js";

// ===========================================================================
// 场景 7：工具函数
// ===========================================================================

export {
  randomSecret,
  base64UrlEncode,
  base64UrlDecode,
  base64UrlEncodeBytes,
  base64UrlDecodeBytes,
  timingSafeEqualBytes,
  httpError,
  normalizeEnvKey,
  bearerToken,
  parseDotenvEntries,
} from "./utils/helpers.js";
