/**
 * Daemon 端口分配器。
 *
 * 关键点（中文）
 * - 当用户未显式传 `--port` 时，为每个 agent 自动挑选可用端口。
 * - 仅负责“本机可监听性”探测，不做跨进程强一致锁；最终仍以 listen 成功为准。
 */
type AllocatePortParams = {
    start?: number;
    end?: number;
    host?: string;
};
/**
 * 在给定范围内分配一个可用端口。
 */
export declare function allocateAvailablePort(params?: AllocatePortParams): Promise<number>;
export {};
//# sourceMappingURL=PortAllocator.d.ts.map