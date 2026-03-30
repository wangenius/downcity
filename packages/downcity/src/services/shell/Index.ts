/**
 * Shell Service（V2）。
 *
 * 关键点（中文）
 * - 默认导出一个 shell service definition，供静态装配使用。
 * - 真正运行时的 per-agent 实例由 ServiceClassRegistry 创建。
 */

import type { Service } from "@/types/Service.js";
import { ShellService } from "./ShellService.js";

export { ShellService } from "./ShellService.js";

export const shellService: Service = new ShellService(null);
