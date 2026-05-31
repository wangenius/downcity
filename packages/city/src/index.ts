/**
 * @downcity/city 公共入口。
 *
 * City 包同时提供服务端运行时与 Gate 访问入口：
 * - `City` 用来创建和部署城市
 * - `Gate` 用来以 user 或 admin 角色访问城市
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
// 场景 4：管理 Bay 与环境变量（内置 Service）
// ===========================================================================

export { EnvService } from "./service/env/env-service.js";
export type {
  EnvEntry,
  EnvUpsertInput,
  EnvRequirementStatus,
  EnvCatalogScope,
} from "./service/env/types.js";
export { EnvStore } from "./service/env/env-store.js";

export { BaysService } from "./service/bays/bays-service.js";
export type { Bay, BayCreateInput, BayStatus } from "./service/bays/types.js";

// ===========================================================================
// 场景 5：数据库工具
// ===========================================================================

export type { Database, DbClient } from "./store/db.js";
export { executeDDL } from "./store/db.js";
export type { CityTableApi } from "./store/table-api.js";
export type { CityUserSchemaInput } from "./store/types.js";

// ===========================================================================
// 场景 6：Gate 访问入口
// ===========================================================================

export type {
  FetchLike,
  FetchResponseLike,
  RawStreamBody,
  RequestInitLike,
} from "./gate/http.js";

export type {
  CityModel,
  CityModelDescriptor,
  CityModelEnvRequirement,
} from "@downcity/type";

export { Gate } from "./gate/gate.js";
export type {
  AdminGateOptions,
  GateBaseOptions,
  GateOptions,
  GateOptionsForRole,
  GateRole,
  UserGateOptions,
} from "./gate/types/gate.js";

export { AIInvoker, ModelCatalog, ModelHandle } from "./gate/invoker/ai/index.js";
export { PaymentInvoker, PaymentMethodHandle } from "./gate/invoker/payment/index.js";
export { ServiceClient, ActionClient } from "./gate/invoker/invoker.js";

export type {
  UserPaymentMethod,
  UserPaymentMethodReason,
  UserPaymentMethodType,
  UserImageResult,
  UserServiceInput,
  UserServiceSummary,
  UserStreamChunk,
  UserStreamResult,
  UserTextResult,
  UserVideoResult,
} from "./gate/user/types.js";

export type {
  UserPaymentMethod as PaymentMethod,
  UserPaymentMethodReason as PaymentMethodReason,
  UserPaymentMethodType as PaymentMethodType,
} from "./gate/invoker/payment/types.js";

export type {
  UserModelRef,
  UserModelInput,
} from "./gate/invoker/ai/types.js";

export { BalanceInvoker, BalanceRedeemCodeInvoker } from "./gate/invoker/balance/index.js";
export { EnvInvoker } from "./gate/invoker/env/index.js";
export { BaysInvoker } from "./gate/invoker/bays/index.js";

export type {
  AdminInstructionResult,
  AdminModelRecord,
  AdminServiceSummary,
} from "./gate/admin/types.js";

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
} from "./gate/invoker/balance/types.js";

export type {
  TokenApplyInput,
  TokenApplyResult,
} from "./gate/invoker/bays/types.js";

// ===========================================================================
// 场景 7：内置表 Schema
// ===========================================================================

export { sqliteBays, pgBays } from "./service/bays/schema.js";
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
