/**
 * 控制面网关。
 *
 * 关键点（中文）
 * - UI 由控制面进程独立托管，不依赖单个 agent 启动参数。
 * - 提供统一的多 agent 选择能力，并通过 RPC 访问选中 agent。
 */
/**
 * 控制面网关启动参数。
 */
export interface ControlGatewayStartOptions {
    /**
     * UI 监听端口。
     */
    port: number;
    /**
     * UI 监听主机。
     */
    host: string;
}
/**
 * 控制面网关。
 */
export declare class ControlGateway {
    private app;
    private server;
    private agentSdkPublishRuntime;
    private readonly publicDir;
    private readonly authService;
    private readonly agentRpcPool;
    constructor();
    /**
     * 注册网关路由。
     */
    private setupRoutes;
    private readRequestedAgentId;
    private pickDirectoryPath;
    private listKnownAgents;
    private buildAgentsResponse;
    /**
     * 构建 City AIService Model 面板响应。
     *
     * 关键点（中文）
     * - 模型目录来自 City AIService，而不是 Town 本地模型池。
     * - `agentPrimaryModelId` 仅用于展示当前选中 agent 的项目绑定。
     */
    private buildModelResponse;
    /**
     * 读取单个配置文件状态。
     *
     * 关键点（中文）
     * - 不抛出异常，统一返回 `status/reason` 便于 UI 汇总展示。
     * - 使用最小探测维度：存在性、文件类型、可读性、大小、修改时间。
     */
    private readConfigFileStatus;
    /**
     * 构建配置文件状态响应。
     *
     * 关键点（中文）
     * - `platform` 维度始终返回。
     * - `agent` 维度仅在存在选中 agent 时返回，避免误导。
     */
    private buildConfigStatusResponse;
    private resolveSelectedAgent;
    /**
     * 根据 id 查找 agent（允许离线 agent，用于 command 页面）。
     */
    private resolveAgentById;
    /**
     * 探测目录状态，用于“打开文件夹”流程。
     */
    private inspectAgentDirectory;
    /**
     * 列出可直接用于 local executor 的本地 GGUF 模型。
     */
    private listLocalModels;
    /**
     * 在 agent 项目目录中执行 shell 命令。
     *
     * 关键点（中文）
     * - 默认 shell 使用 zsh，保持与 CLI 使用习惯一致。
     * - 输出做大小限制，避免单次命令把 UI 网关进程内存打满。
     */
    private executeShellCommand;
    private initializeAgentProject;
    private startAgentByProjectRoot;
    private updateAgentExecution;
    private inspectAgentRestartSafety;
    private restartAgentByProjectRoot;
    private stopAgentByProjectRoot;
    private serveFrontendPath;
    /**
     * 启动 UI 网关。
     */
    start(options: ControlGatewayStartOptions): Promise<void>;
    /**
     * 停止 UI 网关。
     */
    stop(): Promise<void>;
}
export declare function createControlGateway(): ControlGateway;
//# sourceMappingURL=ControlGateway.d.ts.map