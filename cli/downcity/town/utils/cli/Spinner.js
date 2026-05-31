/**
 * CLI Spinner 工具。
 *
 * 关键点（中文）
 * - 为长时间运行的异步操作提供帧动画 spinner。
 * - 自己管理光标控制，不与 readline 或其他 spinner 库抢占。
 * - 非 TTY / JSON 模式自动禁用，避免污染输出。
 */
const DEFAULT_SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const DEFAULT_SPINNER_INTERVAL_MS = 80;
/**
 * 判断当前环境是否应渲染 spinner。
 *
 * 关键点（中文）
 * - JSON 输出模式必须禁用，保证 stdout 纯净。
 * - 非 TTY 终端（管道/重定向）自动禁用。
 */
export function shouldRenderSpinner(params) {
    if (params?.disabled === true)
        return false;
    const stream = params?.stream || process.stdout;
    if (stream.isTTY !== true)
        return false;
    return true;
}
/**
 * 创建 spinner 实例。
 *
 * 关键点（中文）
 * - 自己管理帧动画，避免和外部库互相抢占光标。
 * - stop 时主动清掉整行，保证后续正文输出从干净位置开始。
 */
export function createSpinner(params) {
    const stream = params.stream || process.stdout;
    const intervalMs = typeof params.intervalMs === "number" && params.intervalMs > 0
        ? params.intervalMs
        : DEFAULT_SPINNER_INTERVAL_MS;
    const frames = Array.isArray(params.frames) && params.frames.length > 0
        ? params.frames
        : DEFAULT_SPINNER_FRAMES;
    let timer = null;
    let frameIndex = 0;
    const render = () => {
        const frame = frames[frameIndex % frames.length];
        frameIndex += 1;
        if (typeof stream.clearLine === "function" && typeof stream.cursorTo === "function") {
            stream.clearLine(0);
            stream.cursorTo(0);
            stream.write(`${frame} ${params.text}`);
            return;
        }
        stream.write(`\r${frame} ${params.text}`);
    };
    const clear = () => {
        if (typeof stream.clearLine === "function" && typeof stream.cursorTo === "function") {
            stream.clearLine(0);
            stream.cursorTo(0);
            return;
        }
        stream.write("\r");
    };
    return {
        start() {
            if (timer)
                return;
            render();
            timer = setInterval(render, intervalMs);
        },
        stop() {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
            clear();
        },
    };
}
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
export async function runWithSpinner(task, options) {
    if (!shouldRenderSpinner({ disabled: options?.disabled, stream: options?.stream })) {
        return await task();
    }
    const spinner = createSpinner({
        text: String(options?.text || "Working...").trim(),
        stream: options?.stream,
        intervalMs: options?.intervalMs,
        frames: options?.frames,
    });
    spinner.start();
    try {
        return await task();
    }
    finally {
        spinner.stop();
    }
}
//# sourceMappingURL=Spinner.js.map