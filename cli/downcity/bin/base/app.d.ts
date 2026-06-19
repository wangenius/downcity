#!/usr/bin/env node
/**
 * Downcity Federation 交互入口与工作区调度。
 *
 * 状态流转：
 *   welcome/home → connect/switch Federation → server workspace → server management/admin tools
 *
 * 关键说明（中文）
 * - `downfed` 只负责 Federation 与 admin 管理。
 * - user 登录与本机 runtime 统一由 `downcity` 承担。
 */
export declare function runFederationApp(argv?: string[]): Promise<void>;
//# sourceMappingURL=app.d.ts.map