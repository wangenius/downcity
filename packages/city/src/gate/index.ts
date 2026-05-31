/**
 * City Gate 访问入口。
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

export { Gate } from "./gate.js";
export type {
  AdminGateOptions,
  GateBaseOptions,
  GateOptions,
  GateRole,
  UserGateOptions,
} from "./types/gate.js";

// ===========================================================================
// 用户端
// ===========================================================================

export { UserClient } from "./user/index.js";
export { AIInvoker, ModelCatalog, ModelHandle } from "./invoker/ai/index.js";
export { PaymentInvoker, PaymentMethodHandle } from "./invoker/payment/index.js";
export { ServiceClient, ActionClient } from "./invoker/invoker.js";

export type {
  UserClientOptions,
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

// ===========================================================================
// 管理端
// ===========================================================================

export { AdminClient } from "./admin/index.js";
export { BalanceInvoker, BalanceRedeemCodeInvoker } from "./invoker/balance/index.js";
export { EnvInvoker } from "./invoker/env/index.js";
export { StudiosInvoker } from "./invoker/studios/index.js";

export type {
  AdminClientOptions,
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
  Studio,
  StudioCreateInput,
  TokenApplyInput,
  TokenApplyResult,
} from "./invoker/studios/types.js";
