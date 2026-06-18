/**
 * CLI Spinner 工具。
 *
 * 关键点（中文）
 * - 为长时间运行的异步操作提供帧动画 spinner。
 * - 自己管理光标控制，不与 readline 或其他 spinner 库抢占。
 * - 非 TTY / JSON 模式自动禁用，避免污染输出。
 */
/**
 * Spinner 写入流抽象（兼容 process.stdout 和模拟流）。
 */
export interface SpinnerStream {
    isTTY?: boolean;
    write: (chunk: string) => unknown;
    clearLine?: (dir: number) => unknown;
    cursorTo?: (col: number) => unknown;
}
/**
 * Spinner 控制句柄。
 */
export interface Spinner {
    /** 启动动画。 */
    start: () => void;
    /** 停止动画并清除行。 */
    stop: () => void;
}
/**
 * Spinner 运行选项。
 */
export interface RunWithSpinnerOptions {
    /** spinner 前缀文案（如 "stopping..."）。 */
    text?: string;
    /** 是否强制禁用 spinner（JSON 模式等）。 */
    disabled?: boolean;
    /** 写入流（默认 process.stdout）。 */
    stream?: SpinnerStream;
    /** 帧间隔 ms。 */
    intervalMs?: number;
    /** 自定义帧序列。 */
    frames?: string[];
}
/**
 * 判断当前环境是否应渲染 spinner。
 *
 * 关键点（中文）
 * - JSON 输出模式必须禁用，保证 stdout 纯净。
 * - 非 TTY 终端（管道/重定向）自动禁用。
 */
export declare function shouldRenderSpinner(params?: {
    disabled?: boolean;
    stream?: SpinnerStream;
}): boolean;
/**
 * 创建 spinner 实例。
 *
 * 关键点（中文）
 * - 自己管理帧动画，避免和外部库互相抢占光标。
 * - stop 时主动清掉整行，保证后续正文输出从干净位置开始。
 */
export declare function createSpinner(params: {
    text: string;
    stream?: SpinnerStream;
    intervalMs?: number;
    frames?: string[];
}): Spinner;
/**
 * 在异步任务执行期间显示 spinner。
 *
 * 关键点（中文）
 * - 自动判断是否渲染（非 TTY / disabled 时跳过）。
 * - 无论 task 成功或失败，finally 中保证 stop。
 *
 * @example
 * const result = await runWithSpinner(
 *   () => heavyTask(),
 *   { text: "Processing..." },
 * );
 */
export declare function runWithSpinner<T>(task: () => Promise<T>, options?: RunWithSpinnerOptions): Promise<T>;
//# sourceMappingURL=Spinner.d.ts.map