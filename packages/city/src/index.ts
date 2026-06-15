/**
 * @downcity/city 公共入口。
 *
 * City 包同时提供服务端 CityBase 与客户端 City：
 * - `CityBase` 用来创建和部署城市服务端
 * - `City` 用来以 user 或 admin 角色访问城市
 */

// ===========================================================================
// 场景 1：创建 CityBase 实例
// ===========================================================================

export { CityBase } from "./core/base/base.js";
export type { CityBaseOptions, CityBaseHealthStatus } from "./core/types.js";
export type { CityHandleRequestOptions, CityRequestExecutionContext } from "./core/types.js";
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
  RuntimeMetering,
} from "./types/Metering.js";

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
// 场景 4：管理 Town 与环境变量（内置 Service）
// ===========================================================================

export { EnvService } from "./service/env/env-service.js";
export type {
  EnvEntry,
  EnvRefreshResult,
  EnvUpsertInput,
  EnvRequirementStatus,
  EnvCatalogScope,
} from "./service/env/types.js";
export { EnvStore } from "./service/env/env-store.js";

export { TownsService } from "./service/towns/towns-service.js";
export type { Town, TownCreateInput, TownStatus } from "./service/towns/types.js";

// ===========================================================================
// 场景 5：数据库工具
// ===========================================================================

export type { Database, DbClient } from "./store/db.js";
export { executeDDL } from "./store/db.js";
export type { CityTableApi } from "./store/table-api.js";
export type { CityUserSchemaInput } from "./store/types.js";

// ===========================================================================
// 场景 6：City 客户端访问入口
// ===========================================================================

export type {
  FetchLike,
  FetchResponseLike,
  RawStreamBody,
  RequestInitLike,
} from "./city/http.js";

export type {
  CityModel,
  CityModelDescriptor,
  CityModelEnvRequirement,
} from "@downcity/type";

export { City } from "./city/city.js";
export type {
  AdminCityOptions,
  CityClientBaseOptions,
  CityOptions,
  CityOptionsForRole,
  CityRole,
  UserCityOptions,
} from "./city/types/city.js";

export { AIInvoker, ModelCatalog, ModelHandle } from "./city/invoker/ai/index.js";
export { PaymentInvoker, PaymentMethodHandle } from "./city/invoker/payment/index.js";
export { ServiceClient, ActionClient } from "./city/invoker/invoker.js";

export type {
  UserPaymentMethod,
  UserPaymentMethodReason,
  UserPaymentMethodType,
  UserImageContent,
  UserImageFileContent,
  UserImageInput,
  UserImageJobCreateResult,
  UserImageJobResult,
  UserImageJobResultInput,
  UserImageJobStatus,
  UserImageMessage,
  UserImageResult,
  UserImageTextContent,
  UserServiceInput,
  UserServiceSummary,
  UserStreamChunk,
  UserStreamResult,
  UserTextResult,
  UserVideoResult,
} from "./city/user/types.js";

export type {
  AIImageJobStepContext,
  AIImageJobStepResult,
  AIImageJobStepState,
} from "./service/ai/job-types.js";

export type {
  UserPaymentMethod as PaymentMethod,
  UserPaymentMethodReason as PaymentMethodReason,
  UserPaymentMethodType as PaymentMethodType,
} from "./city/invoker/payment/types.js";

export type {
  UserModelRef,
  UserModelInput,
} from "./city/invoker/ai/types.js";

export { BalanceInvoker, BalanceRedeemCodeInvoker } from "./city/invoker/balance/index.js";
export { EnvInvoker } from "./city/invoker/env/index.js";
export { TownsInvoker } from "./city/invoker/towns/index.js";

export type {
  AdminInstructionResult,
  AdminModelRecord,
  AdminServiceSummary,
} from "./city/admin/types.js";

export type {
  BalanceAccountRecord,
  BalanceHistoryListInput,
  BalanceLedgerRecord,
  BalanceMutationInput,
  BalanceRedeemCodeCreateInput,
  BalanceRedeemCodeDisableInput,
  BalanceRedeemCodeIssueResult,
  BalanceRedeemCodeListInput,
  BalanceRedeemCodeRecord,
  BalanceTopupListInput,
  BalanceTopupRecord,
  BalanceTopupUpdateInput,
} from "./city/invoker/balance/types.js";

export type {
  TokenApplyInput,
  TokenApplyResult,
} from "./city/invoker/towns/types.js";

// ===========================================================================
// 场景 7：内置表 Schema
// ===========================================================================

export { sqliteTowns, pgTowns } from "./service/towns/schema.js";
export { sqliteEnv, pgEnv } from "./service/env/schema.js";

// ===========================================================================
// 场景 8：工具函数
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
