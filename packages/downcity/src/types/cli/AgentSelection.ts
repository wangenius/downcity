/**
 * agent 选择与列表展示类型定义。
 *
 * 关键点（中文）
 * - 统一描述 `city agent list` 与 `city agent start` 交互选择共用的数据结构。
 * - 类型集中放在 `src/types/cli/`，避免命令层继续散落匿名对象协议。
 */

/**
 * CLI 侧的已登记 agent 视图。
 */
export type CliRegisteredAgentView = {
  /**
   * agent 展示名称。
   *
   * 说明（中文）
   * - 优先读取 `downcity.json.name`。
   * - 若未配置则回退为目录名。
   */
  name: string;

  /**
   * agent 项目根目录绝对路径。
   *
   * 说明（中文）
   * - 作为 CLI 展示与后续启动目标的唯一定位键。
   */
  projectRoot: string;

  /**
   * registry 当前记录的运行状态。
   *
   * 说明（中文）
   * - 这里只复用 registry 的粗粒度状态。
   * - 更细的实时健康状态由其他命令单独判定。
   */
  status: "running" | "stopped";
};

/**
 * 交互式 agent 选择器中的单项 choice。
 */
export type CliAgentPromptChoice = {
  /**
   * choice 主标题。
   *
   * 说明（中文）
   * - 终端里通常展示为 agent 名称。
   */
  title: string;

  /**
   * choice 被选中后的返回值。
   *
   * 说明（中文）
   * - 这里直接使用 projectRoot，便于后续命令链路复用。
   */
  value: string;

  /**
   * choice 辅助说明。
   *
   * 说明（中文）
   * - 用于展示状态和绝对路径，帮助用户区分同名 agent。
   */
  description: string;
};

/**
 * `agent start` 目标解析的输入参数。
 */
export type ResolveCliAgentStartTargetDecisionInput = {
  /**
   * 用户在命令行中显式传入的路径参数。
   *
   * 说明（中文）
   * - 为空时表示用户没有指定路径，需要根据当前目录或交互选择补齐目标。
   */
  pathInput?: string;

  /**
   * 当前 CLI 进程的工作目录绝对路径。
   *
   * 说明（中文）
   * - 当该目录本身就是已初始化 agent 项目时，应优先直接启动当前目录。
   */
  currentWorkingDirectory: string;

  /**
   * 当前工作目录是否已经满足最小 agent 初始化条件。
   *
   * 说明（中文）
   * - 条件通常是 `PROFILE.md` 与 `downcity.json` 同时存在。
   */
  currentDirectoryInitialized: boolean;

  /**
   * 当前会话是否允许交互输入。
   *
   * 说明（中文）
   * - 非 TTY 场景下不能弹选择器，因此必须返回显式错误决策。
   */
  interactive: boolean;

  /**
   * 当前 city registry 中已登记的 agent 列表。
   *
   * 说明（中文）
   * - 当用户未传路径且当前目录不是 agent 项目时，这份列表就是交互选择的数据源。
   */
  registeredAgents: CliRegisteredAgentView[];
};

/**
 * `agent start` 目标解析后的决策结果。
 */
export type ResolveCliAgentStartTargetDecision =
  | {
      /**
       * 决策模式。
       *
       * 说明（中文）
       * - `explicit`：用户传了显式路径。
       * - `current`：直接使用当前工作目录。
       */
      mode: "explicit" | "current";

      /**
       * 最终确定的 agent 项目根目录。
       *
       * 说明（中文）
       * - 仅在已明确目标目录时存在。
       */
      projectRoot: string;
    }
  | {
      /**
       * 决策模式。
       *
       * 说明（中文）
       * - `prompt` 表示进入交互选择器。
       */
      mode: "prompt";
    }
  | {
      /**
       * 决策模式。
       *
       * 说明（中文）
       * - `error` 表示当前上下文无法自动推导启动目标。
       */
      mode: "error";

      /**
       * 当前错误的标准化原因码。
       *
       * 说明（中文）
       * - `no-registered-agents`：registry 中没有可选 agent。
       * - `non-interactive`：当前终端无法弹出交互选择器。
       */
      reason: "no-registered-agents" | "non-interactive";
    };
