/**
 * Service 类型定义。
 *
 * 关键点（中文）
 * - 这里集中声明 service 体系的共享契约。
 * - 这些类型会被 main/service、services/*、tests 等多层复用，因此提升到 `src/types/`。
 * - `main/service/ServiceManager.ts` 之后只保留门面 re-export，不再承担类型源文件职责。
 */

import type { Command } from "commander";
import type { Context as HonoContext } from "hono";
import type { ExecutionContext } from "@/shared/types/ExecutionContext.js";
import type { JsonValue } from "@/shared/types/Json.js";

/**
 * 服务运行状态。
 */
export type ServiceState =
  | "running"
  | "stopped"
  | "starting"
  | "stopping"
  | "error";

/**
 * 服务命令执行结果。
 */
export type ServiceCommandResult = {
  /**
   * 本次命令是否执行成功。
   */
  success: boolean;
  /**
   * 对人类可读的补充说明文本。
   */
  message?: string;
  /**
   * 命令附带返回的数据载荷。
   */
  data?: JsonValue;
};

/**
 * 单个 action 执行结果。
 */
export type ServiceActionResult<R extends JsonValue = JsonValue> = {
  /**
   * action 是否执行成功。
   */
  success: boolean;
  /**
   * action 成功时返回的数据载荷。
   */
  data?: R;
  /**
   * action 失败时返回的错误文本。
   */
  error?: string;
};

/**
 * Action CLI 输入。
 */
export type ServiceActionCommandInput = {
  /**
   * 位置参数列表。
   */
  args: string[];
  /**
   * 解析后的 option 键值对。
   */
  opts: Record<string, JsonValue>;
};

/**
 * Action CLI 定义。
 */
export type ServiceActionCommand<P extends JsonValue = JsonValue> = {
  /**
   * CLI 子命令描述。
   */
  description: string;
  /**
   * 对 commander command 的额外配置。
   */
  configure?: (command: Command) => void;
  /**
   * 把 CLI 输入映射为结构化 payload。
   */
  mapInput: (input: ServiceActionCommandInput) => P | Promise<P>;
};

/**
 * Action HTTP 定义。
 */
export type ServiceActionApi<P extends JsonValue = JsonValue> = {
  /**
   * HTTP 方法。
   */
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /**
   * 自定义路由路径；省略时走默认 `/service/<service>/<action>`。
   */
  path?: string;
  /**
   * 把 HTTP 请求映射为结构化 payload。
   */
  mapInput?: (ctx: HonoContext) => P | Promise<P>;
};

/**
 * 单个 service action 定义。
 */
export type ServiceAction<
  P extends JsonValue = JsonValue,
  R extends JsonValue = JsonValue,
> = {
  /**
   * CLI 定义；省略则该 action 不暴露为 CLI 子命令。
   */
  command?: ServiceActionCommand<P>;
  /**
   * HTTP API 定义；省略则该 action 不注册 HTTP 路由。
   */
  api?: ServiceActionApi<P>;
  /**
   * action 的实际执行函数。
   */
  execute: (params: {
    /**
     * 当前统一执行上下文。
     */
    context: ExecutionContext;
    /**
     * 当前 action 的结构化输入。
     */
    payload: P;
    /**
     * 当前 service 名称。
     */
    serviceName: string;
    /**
     * 当前 action 名称。
     */
    actionName: string;
  }) => Promise<ServiceActionResult<R>> | ServiceActionResult<R>;
};

/**
 * Service action 映射。
 *
 * 关键点（中文）
 * - key 就是 action 名称。
 * - 使用对象结构，便于直接按名称索引和动态装配。
 */
export type ServiceActions = {
  [actionName: string]: ServiceAction<JsonValue, JsonValue>;
};

/**
 * Service 生命周期扩展能力。
 */
export interface ServiceLifecycle {
  /**
   * service 启动钩子。
   */
  start?(context: ExecutionContext): Promise<void> | void;
  /**
   * service 停止钩子。
   */
  stop?(context: ExecutionContext): Promise<void> | void;
  /**
   * 非 action 命令分发钩子。
   */
  command?(params: {
    /**
     * 当前统一执行上下文。
     */
    context: ExecutionContext;
    /**
     * 当前命令名称。
     */
    command: string;
    /**
     * 可选 payload。
     */
    payload?: JsonValue;
  }): Promise<ServiceCommandResult> | ServiceCommandResult;
}

/**
 * Service：服务统一契约。
 */
export interface Service {
  /**
   * service 名称。
   */
  name: string;
  /**
   * action 集合。
   *
   * 关键点（中文）
   * - 一个 service 对应多个 action。
   * - main 会基于这里自动注册 CLI 与 HTTP 路由。
   */
  actions: ServiceActions;
  /**
   * service 级 system 文本构建器。
   */
  system?: (context: ExecutionContext) => string | Promise<string>;
  /**
   * service 生命周期钩子集合。
   */
  lifecycle?: ServiceLifecycle;
}
