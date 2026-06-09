#!/usr/bin/env node
/**
 * Downcity City 交互入口与工作区调度。
 *
 * 状态流转：
 *   welcome/home → connect/switch City → server workspace → server management/admin tools
 *
 * 关键说明（中文）
 * - `city` 只负责 City base 与 admin 管理。
 * - user 登录与本机 runtime 统一由 `town city login` 承担。
 */
export declare function runCityApp(argv?: string[]): Promise<void>;
//# sourceMappingURL=app.d.ts.map