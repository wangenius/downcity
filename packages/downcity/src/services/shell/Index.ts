/**
 * Shell service。
 *
 * 关键点（中文）
 * - 把 shell 状态机从 agent tool 内部抽离到独立 service。
 * - tool 只负责协议适配，shell 生命周期由 service 统一管理。
 */

import type { Service } from "@/console/service/ServiceManager.js";
import type {
  ShellCloseRequest,
  ShellExecRequest,
  ShellQueryRequest,
  ShellReadRequest,
  ShellStartRequest,
  ShellWaitRequest,
  ShellWriteRequest,
} from "@services/shell/types/ShellService.js";
import {
  bindShellRuntime,
  closeAllShellSessions,
  closeShellSession,
  execShellCommand,
  getShellSessionStatus,
  readShellSession,
  startShellSession,
  waitShellSession,
  writeShellSession,
} from "./runtime/SessionStore.js";

export const shellService: Service = {
  name: "shell",
  actions: {
    exec: {
      async execute(params) {
        const result = await execShellCommand(
          params.context,
          params.payload as ShellExecRequest,
        );
        return {
          success: true,
          data: result,
        };
      },
    },
    start: {
      async execute(params) {
        const result = await startShellSession(
          params.context,
          params.payload as ShellStartRequest,
        );
        return {
          success: true,
          data: result,
        };
      },
    },
    status: {
      async execute(params) {
        const result = await getShellSessionStatus(
          params.context,
          params.payload as ShellQueryRequest,
        );
        return {
          success: true,
          data: result,
        };
      },
    },
    read: {
      async execute(params) {
        const result = await readShellSession(
          params.context,
          params.payload as ShellReadRequest,
        );
        return {
          success: true,
          data: result,
        };
      },
    },
    write: {
      async execute(params) {
        const result = await writeShellSession(
          params.context,
          params.payload as ShellWriteRequest,
        );
        return {
          success: true,
          data: result,
        };
      },
    },
    wait: {
      async execute(params) {
        const result = await waitShellSession(
          params.context,
          params.payload as ShellWaitRequest,
        );
        return {
          success: true,
          data: result,
        };
      },
    },
    close: {
      async execute(params) {
        const result = await closeShellSession(
          params.context,
          params.payload as ShellCloseRequest,
        );
        return {
          success: true,
          data: result,
        };
      },
    },
  },
  lifecycle: {
    async start(context) {
      bindShellRuntime(context);
    },
    async stop() {
      await closeAllShellSessions(true);
    },
  },
};
