import type { Logger } from "@utils/logger/Logger.js";
import type {
  ServiceModelFactory,
  ServiceContextManager,
  ServiceHostPort,
} from "./ServiceRuntimePorts.js";
import type { ShipConfig } from "@main/types/ShipConfig.js";

/**
 * Service 统一运行时依赖。
 *
 * 关键点（中文）
 * - 所有 services 使用同一套注入依赖类型，保证可扩展性。
 * - 是否使用某个字段由具体 service 自行决定。
 * - 具体实现由 server 注入，services 仅依赖抽象端口。
 *
 * 字段说明（中文）
 * - `cwd/rootPath/config/utils/logger/systems`：所有 service 都可用的基础上下文。
 * - `host`：services -> main 的统一通信端口（request context + action dispatch）。
 * - 其余可选字段为“能力端口”：由 server 注入，按需使用。
 */
export type ServiceRuntimeDependencies = {
  /**
   * 启动命令传入的工作目录（原始 cwd）。
   *
   * 作用（中文）
   * - 用于保留用户启动时的目录语义（例如 CLI 输入的相对路径基准）。
   * - 当 service 需要复现“用户在什么目录启动”的行为时可读取该字段。
   *
   * 使用建议（中文）
   * - 仅在需要“原始启动上下文”时使用。
   * - 涉及项目内持久化路径时优先使用 `rootPath`。
   */
  cwd: string;

  /**
   * 当前进程服务的项目根目录（绝对路径）。
   *
   * 作用（中文）
   * - 作为 service 读写项目文件的统一根路径。
   * - `.ship/*`、task、context、skills 等落盘路径都应以它为锚点。
   *
   * 使用建议（中文）
   * - 任何文件系统操作优先以 `rootPath` 解析绝对路径，避免依赖进程当前目录漂移。
   */
  rootPath: string;

  /**
   * 进程级日志器。
   *
   * 作用（中文）
   * - 提供统一日志输出能力（info/warn/error/save 等）。
   * - 保证 services 与 main 的日志格式、落盘位置一致，便于排障。
   *
   * 使用建议（中文）
   * - 关键分支、失败重试、降级路径都应记录日志。
   * - 用户输入/敏感信息应避免直接明文输出。
   */
  logger: Logger;

  /**
   * 已解析后的 ship 配置对象。
   *
   * 作用（中文）
   * - 为 service 提供运行策略参数（如 adapters、queue、task、memory 等）。
   * - 由 main 在启动时统一加载并注入，service 只消费，不负责解析。
   *
   * 使用建议（中文）
   * - 读取配置前应给出合理默认值，避免因可选字段缺失导致异常。
   */
  config: ShipConfig;

  /**
   * 当前运行态生效的 system prompts 列表。
   *
   * 作用（中文）
   * - 让 service 在需要时可感知当前系统提示组合（静态 + 动态 providers）。
   * - 常用于调试、可观测或对话行为审计场景。
   *
   * 使用建议（中文）
   * - 以只读视角使用，不应在 service 内直接修改该数组内容。
   */
  systems: string[];

  /**
   * services -> main 的统一主机端口（核心通信入口）。
   *
   * 作用（中文）
   * - 读取当前请求上下文（`getRequestContext`）。
   * - 在指定请求上下文内执行逻辑（`withRequestContext`）。
   * - 按 `service/action` 分发调用其他 service 能力（`dispatch`）。
   *
   * 设计意图（中文）
   * - 收敛所有跨层交互能力，避免为每个能力新增一个固定 bridge 字段。
   * - 降低 services 对 main 具体实现的耦合面。
   */
  host: ServiceHostPort;

  /**
   * 会话管理能力端口（可选）。
   *
   * 作用（中文）
   * - 访问 context store（读写消息、meta）。
   * - 获取/清理上下文 agent。
   * - 触发 context 更新后的异步维护流程。
   *
   * 为何可选（中文）
   * - 不是所有 service 都需要直接操作会话状态。
   * - 使用点必须显式校验存在性（缺失时给出清晰错误）。
   */
  contextManager?: ServiceContextManager;

  /**
   * 模型工厂端口（可选）。
   *
   * 作用（中文）
   * - 按当前配置创建可执行的语言模型实例。
   * - 常用于 memory 提取、压缩等需要独立模型调用的后台流程。
   *
   * 为何可选（中文）
   * - 并非所有 service 都需要直接创建模型。
   * - 使用点需显式校验，避免隐式依赖。
   */
  modelFactory?: ServiceModelFactory;
};
