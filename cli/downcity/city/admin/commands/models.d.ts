/**
 * Admin Models 只读视图。
 *
 * 关键说明（中文）
 * - 这里不提供模型新增、删除、启停。
 * - 模型定义仍然来自代码注册；admin 只负责查看当前可用状态。
 * - 如果模型缺少 provider key，会在这里直接显示缺失项。
 */
import { City } from "@downcity/city";
import type { admin_tui_runtime } from "../../types/AdminTui.js";
/**
 * 展示全部代码注册模型及其运行状态。
 */
export declare function manageModels(a: City, _baseUrl: string, runtime: admin_tui_runtime): Promise<void>;
//# sourceMappingURL=models.d.ts.map