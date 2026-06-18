/**
 * Admin Env 管理命令。
 *
 * 三种模式：
 * - Init：遍历所有 service 的 env 需求，逐一交互式配置
 * - 按 Service 查看：选择一个 service，查看/配置其 env
 * - 直接管理：list / upsert / remove 裸 key-value
 */
import { CityPact } from "@downcity/city";
import type { admin_tui_runtime } from "../../types/AdminTui.js";
export declare function manageEnv(a: CityPact, _baseUrl: string, runtime: admin_tui_runtime): Promise<void>;
//# sourceMappingURL=service-env.d.ts.map