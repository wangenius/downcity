/**
 * CityRuntime：city 后台进程状态工具。
 *
 * 关键点（中文）
 * - city 后台负责统一管理/观测多个 agent daemon。
 * - 这里处理的是 city 后台自身的 pid 与判活，不涉及 gateway 进程。
 * - agent daemon 启动前必须确保 city 后台已启动（强约束）。
 */
/**
 * 读取 city 后台 pid（读取失败或内容非法返回 null）。
 */
export declare function readCityPid(): Promise<number | null>;
/**
 * 判断 city 后台进程是否存活。
 */
export declare function isCityProcessAlive(pid: number): boolean;
/**
 * 判断 city 后台是否在运行（基于 pid file + 判活）。
 */
export declare function isCityRunning(): Promise<boolean>;
//# sourceMappingURL=CityRuntime.d.ts.map