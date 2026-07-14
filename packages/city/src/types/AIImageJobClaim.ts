/**
 * AI 图片任务领取类型模块。
 *
 * 该类型只用于 City 内部协调并发的 image/fetch worker，不属于 Provider 或客户端协议。
 */

import type { AsyncJobRecord } from "./AsyncJob.js";

/** 已被当前 worker 原子领取的图片任务。 */
export interface AIImageJobClaim {
  /** 进入 fetching 状态后的完整任务记录。 */
  record: AsyncJobRecord;
  /** 本次领取写入的时间戳，同时作为后续 CAS 的所有权令牌。 */
  claimed_at: string;
}
