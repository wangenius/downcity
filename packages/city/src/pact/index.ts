/**
 * City 访问入口。
 */

// ===========================================================================
// HTTP 公共类型
// ===========================================================================

export type {
  FetchLike,
  FetchResponseLike,
  RawStreamBody,
  RequestInitLike,
} from "./http.js";

export { CityPact } from "./pact.js";
export type {
  AdminPactOptions,
  CityPactClientBaseOptions,
  CityPactOptions,
  CityPactOptionsForRole,
  CityPactRole,
  UserPactOptions,
} from "./types/pact.js";

// ===========================================================================
// City 能力类型
// ===========================================================================

export { AIInvoker, ModelCatalog, ModelHandle } from "./invoker/ai/index.js";
export { PaymentInvoker, PaymentMethodHandle } from "./invoker/payment/index.js";
export { ServiceClient, ActionClient } from "./invoker/invoker.js";

export type {
  UserPaymentMethod,
  UserPaymentMethodReason,
  UserPaymentMethodType,
  UserImageJobCreateResult,
  UserImageJobResult,
  UserImageJobResultInput,
  UserImageJobStatus,
  UserImageResult,
  UserServiceInput,
  UserServiceSummary,
  UserStreamChunk,
  UserStreamResult,
  UserTextResult,
  UserVideoResult,
} from "./user/types.js";

export type {
  UserPaymentMethod as PaymentMethod,
  UserPaymentMethodReason as PaymentMethodReason,
  UserPaymentMethodType as PaymentMethodType,
} from "./invoker/payment/types.js";

export type {
  UserModelRef,
  UserModelInput,
} from "./invoker/ai/types.js";

export { BalanceInvoker, BalanceRedeemCodeInvoker } from "./invoker/balance/index.js";
export { EnvInvoker } from "./invoker/env/index.js";
export { CitiesInvoker } from "./invoker/cities/index.js";

export type {
  AdminInstructionResult,
  AdminModelRecord,
  AdminServiceSummary,
} from "./admin/types.js";

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
} from "./invoker/balance/types.js";

export type {
  EnvCatalogScope,
  EnvEntry,
  EnvRequirementStatus,
  EnvUpsertInput,
} from "./invoker/env/types.js";

export type {
  City,
  CityCreateInput,
  TokenApplyInput,
  TokenApplyResult,
} from "./invoker/cities/types.js";
