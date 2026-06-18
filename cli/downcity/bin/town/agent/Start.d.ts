/**
 * 后台常驻启动（daemon）。
 *
 * 对应用户命令：`town agent start`
 *
 * 行为
 * - 在 `.downcity/debug/` 写入 pid/log/meta 文件
 * - 通过 `node <commands/index.js> agent start ...` 启动真正的前台逻辑，但以 detached 方式在后台运行
 *
 * 注意
 * - 前台启动请显式使用 `town agent start --foreground`。
 */
import type { AgentStartOptions } from "../types/AgentStartOptions.js";
/**
 * daemon 启动入口。
 *
 * 流程（中文）
 * 1) 统一预检（town runtime + 项目初始化 + binding）
 * 2) 组装 `agent start` 子进程参数
 * 3) 通过 daemon manager 后台拉起并打印 pid/log
 */
export declare function startCommand(cwd: string | undefined, options: AgentStartOptions): Promise<void>;
//# sourceMappingURL=Start.d.ts.map