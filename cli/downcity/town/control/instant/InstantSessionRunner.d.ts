/**
 * InstantSessionRunner：Inline Composer 即时模式执行运行器。
 *
 * 关键点（中文）
 * - 统一承接 model 即时 executor。
 * - 每次请求都创建独立临时 session，执行结束后立即清理临时目录与 executor。
 * - 不复用长期 runtime session，也不进入 channel/chat 的普通投递链路。
 */
import type { Logger } from "@downcity/agent";
import type { PlatformAgentOption } from "@downcity/agent";
import type { PlatformInlineInstantRunInput, PlatformInlineInstantRunResult, PlatformInlineInstantRunner } from "@downcity/agent";
type InstantSessionRunnerOptions = {
    /**
     * 根据 agentId 解析项目配置。
     */
    resolveAgentById?: (agentId: string) => Promise<PlatformAgentOption | null>;
    /**
     * 可选统一日志器。
     */
    logger?: Logger;
};
/**
 * 即时模式运行器默认实现。
 */
export declare class InstantSessionRunner implements PlatformInlineInstantRunner {
    private readonly resolveAgentById;
    private readonly logger;
    constructor(options?: InstantSessionRunnerOptions);
    run(input: PlatformInlineInstantRunInput): Promise<PlatformInlineInstantRunResult>;
    private createTempHistoryComposer;
    private executeTempSession;
    private buildSessionId;
    private runModelInstant;
}
export {};
//# sourceMappingURL=InstantSessionRunner.d.ts.map