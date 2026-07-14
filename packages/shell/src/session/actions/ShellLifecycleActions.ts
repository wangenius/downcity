/**
 * Shell runtime 生命周期 action。
 *
 * 关键点（中文）
 * - 负责绑定宿主上下文与关闭当前 state 下的所有 shell。
 * - 不处理单个 shell 的 start/read/write 等业务动作。
 */

import type { ShellHostContext } from "@/types/ShellHostContext.js";
import type { ShellRuntimeState } from "@/session/ShellRuntimeTypes.js";
import {
  nowMs,
  updateSessionSnapshot,
} from "../ShellActionRuntimeSupport.js";

/**
 * 绑定当前 shell runtime 实例的 execution runtime。
 */
export function bindShellRuntime(
  state: ShellRuntimeState,
  context: ShellHostContext,
): void {
  state.context = context;
}

/**
 * 关闭当前实例持有的所有活动 shell。
 */
export async function closeAllShellSessions(
  state: ShellRuntimeState,
  force = false,
): Promise<void> {
  const closing = Array.from(state.sessions.values()).map(async (session) => {
    if (
      session.snapshot.status !== "running" &&
      session.snapshot.status !== "starting"
    ) {
      return;
    }
    try {
      session.child.kill(force ? "SIGKILL" : "SIGTERM");
    } catch {
      // ignore
    }
    await updateSessionSnapshot(session, (snapshot) => {
      snapshot.status = force ? "killed" : "failed";
      snapshot.exitCode = force ? -9 : -15;
      snapshot.endedAt = nowMs();
    });
  });
  await Promise.all(closing);
}
