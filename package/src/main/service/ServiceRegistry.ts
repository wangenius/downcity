/**
 * Service 注册契约类型（main/service）。
 *
 * 关键点（中文）
 * - 该类型属于进程编排层，用于承接 service runtime 注册与调度
 * - services 由 registry 统一加载，避免散落硬编码
 */

import type { Command } from "commander";
import type { Handler, Hono } from "hono";
import type { ServiceRuntimeDependencies } from "./types/ServiceRuntimeTypes.js";
import type { JsonValue } from "@/types/Json.js";
import type { SystemPromptProvider } from "@core/types/SystemPromptProvider.js";

/**
 * CLI 命令注册抽象。
 */
export interface CliCommandRegistry {
  command(
    name: string,
    description: string,
    configure: (command: Command) => void,
  ): Command;
  group(
    name: string,
    description: string,
    configure: (group: CliCommandRegistry, groupCommand: Command) => void,
  ): Command;
  raw(): Command;
}

/**
 * HTTP 路由注册抽象。
 */
export interface ServerRouteRegistry {
  get(path: string, handler: Handler): void;
  post(path: string, handler: Handler): void;
  put(path: string, handler: Handler): void;
  del(path: string, handler: Handler): void;
  raw(): Hono;
}

/**
 * 服务运行状态。
 */
export type ServiceRuntimeState =
  | "running"
  | "stopped"
  | "starting"
  | "stopping"
  | "error";

/**
 * 服务命令执行结果。
 */
export type ServiceCommandResult = {
  success: boolean;
  message?: string;
  data?: JsonValue;
};

/**
 * 服务生命周期扩展能力。
 */
export interface ServiceLifecycle {
  start?(context: ServiceRuntimeDependencies): Promise<void> | void;
  stop?(context: ServiceRuntimeDependencies): Promise<void> | void;
  command?(params: {
    context: ServiceRuntimeDependencies;
    command: string;
    payload?: JsonValue;
  }): Promise<ServiceCommandResult> | ServiceCommandResult;
}

/**
 * Service：服务统一契约。
 */
export interface Service {
  name: string;
  registerCli(registry: CliCommandRegistry): void;
  registerServer(
    registry: ServerRouteRegistry,
    context: ServiceRuntimeDependencies,
  ): void;
  /**
   * service 级 system prompt providers（可选）。
   *
   * 关键点（中文）
   * - 由 service 自己声明 provider，进程层统一注册。
   * - 返回空数组表示该 service 无额外 prompt 注入。
   */
  systemPromptProviders?: (params: {
    getContext: () => ServiceRuntimeDependencies;
  }) => SystemPromptProvider[];
  lifecycle?: ServiceLifecycle;
}
