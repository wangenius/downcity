/**
 * PlatformStore Schema 管理。
 *
 * 关键点（中文）
 * - 负责 `PlatformStore` 的建表与轻量迁移。
 * - 启动时执行，不承担任何查询写入业务逻辑。
 */
import type { PlatformStoreContext } from "../../../city/runtime/store/StoreShared.js";
/**
 * 初始化 PlatformStore 所需表结构。
 */
export declare function ensurePlatformStoreSchema(context: PlatformStoreContext): void;
//# sourceMappingURL=StoreSchema.d.ts.map