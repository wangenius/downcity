/**
 * Session FIFO 输入队列。
 *
 * 只负责保存和按顺序取出 Prompt/Command，不执行命令，也不持有 active Turn。
 */

import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type { AgentSessionTurnHandle } from "@/types/sdk/AgentSessionTurn.js";
import type {
  SessionQueueCommand,
  SessionQueueDeferred,
  SessionQueueItem,
  SessionQueuedPrompt,
} from "@/types/session/SessionQueue.js";

/** 单个 Session 的进程内 FIFO。 */
export class SessionQueue {
  private readonly items: SessionQueueItem[] = [];

  /** 追加 Prompt 并返回等待 Turn Handle 的 Promise。 */
  enqueue_prompt(input: AgentSessionPromptInput): Promise<AgentSessionTurnHandle> {
    const deferred_handle = create_deferred<AgentSessionTurnHandle>();
    this.items.push({ type: "prompt", input, deferred_handle });
    return deferred_handle.promise;
  }

  /** 追加明确的领域命令。 */
  enqueue_command(command: SessionQueueCommand): void {
    this.items.push(command);
  }

  /** 当前队列是否包含 Prompt。 */
  has_prompt(): boolean {
    return this.items.some((item) => item.type === "prompt");
  }

  /** 当前队列是否包含 Command。 */
  has_command(): boolean {
    return this.items.some((item) => item.type !== "prompt");
  }

  /** 取出第一条 Prompt，以及它之前按顺序排队的命令。 */
  take_next_prompt(): {
    /** 当前 Prompt 之前的命令。 */
    commands: SessionQueueCommand[];
    /** 当前等待执行的 Prompt。 */
    prompt: SessionQueuedPrompt;
  } | null {
    const prompt_index = this.items.findIndex((item) => item.type === "prompt");
    if (prompt_index < 0) return null;
    const commands = this.items.splice(0, prompt_index) as SessionQueueCommand[];
    const prompt = this.items.shift();
    return prompt?.type === "prompt" ? { commands, prompt } : null;
  }

  /** 取出当前全部输入，供下一个 Step 检查点按顺序提交。 */
  drain(): SessionQueueItem[] {
    return this.items.splice(0, this.items.length);
  }

  /** 把尚未处理的输入恢复到队列头部。 */
  restore_front(items: SessionQueueItem[]): void {
    this.items.unshift(...items);
  }

  /** 取消全部排队 Prompt，同时保留等待下一 Step 的命令。 */
  cancel_prompts(): SessionQueuedPrompt[] {
    const prompts = this.items.filter(
      (item): item is SessionQueuedPrompt => item.type === "prompt",
    );
    const commands = this.items.filter(
      (item): item is SessionQueueCommand => item.type !== "prompt",
    );
    this.items.splice(0, this.items.length, ...commands);
    return prompts;
  }
}

/** 创建最小 Promise 控制器。 */
function create_deferred<T>(): SessionQueueDeferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
