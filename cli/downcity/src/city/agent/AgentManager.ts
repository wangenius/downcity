/**
 * `city agent` 交互式管理器入口。
 *
 * 关键点（中文）
 * - 裸 `city agent` 在交互式终端里进入这里，而不是只输出静态 help。
 * - 保留原有脚本化子命令不变，只把高频的人类操作收敛成轻量 manager。
 */

import { emitCliBlock } from "@/shared/CliReporter.js";
import {
  isInteractiveTerminal,
  loadAgentSummaries,
  promptAgentListSelection,
  runCreateFlow,
  runSelectedAgentManager,
} from "@/city/agent/AgentManagerHelpers.js";

/**
 * 运行 `city agent` 交互式管理器。
 */
export async function runInteractiveAgentManager(): Promise<void> {
  if (!isInteractiveTerminal()) return;

  while (true) {
    const selection = await promptAgentListSelection();
    if (!selection || selection.type === "exit") {
      emitCliBlock({
        tone: "info",
        title: "Agent manager closed",
      });
      return;
    }

    try {
      if (selection.type === "create") {
        await runCreateFlow();
        continue;
      }
      if (selection.type === "agent") {
        const agents = await loadAgentSummaries();
        const agent = agents.find((item) => item.projectRoot === selection.project_root);
        if (!agent) {
          emitCliBlock({
            tone: "info",
            title: "Agent not found",
            note: selection.project_root,
          });
          continue;
        }
        await runSelectedAgentManager(agent);
      }
    } catch (error) {
      emitCliBlock({
        tone: "error",
        title: "Agent manager action failed",
        note: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
