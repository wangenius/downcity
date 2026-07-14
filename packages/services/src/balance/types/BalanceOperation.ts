/**
 * Balance 原子操作内部类型。
 *
 * 这些类型只服务于账务存储层，不属于公开 HTTP 协议。
 */

import type { BalanceLedgerKind } from "../types.js";

/** 原子账务操作记录。 */
export interface BalanceOperationRow extends Record<string, unknown> {
  /** 稳定操作 ID，也是幂等边界。 */
  operation_id: string;
  /** 操作类型。 */
  kind: string;
  /** 关联的业务记录 ID。 */
  record_id: string;
  /** 被修改余额的用户 ID。 */
  user_id: string;
  /** 本次余额变化值。 */
  credits_delta: number;
  /** 当前操作状态。 */
  status: "pending" | "applied";
  /** 操作创建时间。 */
  created_at: string;
  /** 操作完成时间。 */
  applied_at: string;
}

/** 通用余额变化输入。 */
export interface ApplyBalanceDeltaInput {
  /** 被修改余额的用户 ID。 */
  user_id: string;
  /** 正数入账、负数扣款。 */
  credits_delta: number;
  /** 流水类型。 */
  ledger_kind: BalanceLedgerKind;
  /** 流水说明。 */
  note: string;
  /** 外部引用。 */
  ref: string;
  /** 已序列化的扩展信息。 */
  metadata_json: string;
}

/** 原子扣费输入。 */
export interface ApplyBalanceChargeInput {
  /** 扣费记录 ID。 */
  charge_id: string;
  /** 可选稳定幂等键。 */
  idempotency_key?: string;
  /** 被扣费用户 ID。 */
  user_id: string;
  /** 扣费额度，必须为正数。 */
  credits: number;
  /** 扣费说明。 */
  note: string;
  /** 外部引用。 */
  ref: string;
  /** 已序列化的扩展信息。 */
  metadata_json: string;
  /** 已序列化且包含 charge_id 的流水扩展信息。 */
  ledger_metadata_json: string;
  /** 扣费创建时间。 */
  created_at: string;
}

/** 原子业务入账附加信息。 */
export interface ApplyBalanceCreditExtra {
  /** 流水说明。 */
  note: string;
  /** 外部引用。 */
  ref: string;
  /** 已序列化的扩展信息。 */
  metadata_json: string;
}
