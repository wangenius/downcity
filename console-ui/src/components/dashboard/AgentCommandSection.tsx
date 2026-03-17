/**
 * Agent Command 主视图区。
 *
 * 关键点（中文）
 * - 提供“终端风格”的命令执行体验，不引入 PTY 依赖。
 * - 每次执行独立收集 stdout/stderr，并保留会话内历史。
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import type { UiCommandExecuteResult } from "@/types/Dashboard";

interface CommandRunRecord {
  /**
   * 本地记录唯一 id。
   */
  id: string;
  /**
   * 执行结果快照。
   */
  result: UiCommandExecuteResult;
}

export interface AgentCommandSectionProps {
  /**
   * 当前选中 agent id。
   */
  selectedAgentId: string;
  /**
   * 当前选中 agent 展示名。
   */
  selectedAgentName: string;
  /**
   * 执行 command 回调。
   */
  onExecute: (input: {
    command: string;
    timeoutMs?: number;
    agentId?: string;
  }) => Promise<UiCommandExecuteResult>;
}

const QUICK_COMMANDS = ["pwd", "ls -la", "git status -sb", "sma -v"];

export function AgentCommandSection(props: AgentCommandSectionProps) {
  const { selectedAgentId, selectedAgentName, onExecute } = props;
  const [command, setCommand] = React.useState("");
  const [running, setRunning] = React.useState(false);
  const [records, setRecords] = React.useState<CommandRunRecord[]>([]);
  const [errorText, setErrorText] = React.useState("");
  const terminalRef = React.useRef<HTMLDivElement | null>(null);

  const runCommand = React.useCallback(
    async (commandTextInput: string) => {
      const commandText = String(commandTextInput || "").trim();
      if (!commandText || running) return;
      setRunning(true);
      setErrorText("");
      try {
        const result = await onExecute({
          command: commandText,
          timeoutMs: 45_000,
          agentId: selectedAgentId,
        });
        setRecords((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            result,
          },
        ]);
        setCommand("");
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : String(error));
      } finally {
        setRunning(false);
      }
    },
    [onExecute, running, selectedAgentId],
  );

  React.useEffect(() => {
    terminalRef.current?.scrollTo({
      top: terminalRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [records.length, running]);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/75 bg-muted/25 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{selectedAgentName || selectedAgentId || "agent"}</div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">{selectedAgentId || "-"}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setRecords([])} disabled={running || records.length === 0}>
            清空输出
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border/80 bg-black/[0.92] p-3 text-[12px] text-emerald-100 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]">
        <div ref={terminalRef} className="h-[46vh] min-h-[18rem] overflow-auto font-mono leading-relaxed md:h-[54vh]">
          {records.length === 0 ? (
            <div className="text-emerald-300/70">
              {`# 当前 agent: ${selectedAgentName || selectedAgentId || "-"}`}
              <br />
              {"# 输入命令并执行，输出会记录在这里"}
            </div>
          ) : (
            records.map((record) => {
              const meta = `exit=${String(record.result.exitCode ?? "-")} · ${record.result.durationMs}ms${record.result.timedOut ? " · timeout" : ""}`;
              return (
                <div key={record.id} className="mb-3">
                  <div className="text-sky-200">{`$ ${record.result.command}`}</div>
                  <div className="text-[11px] text-emerald-300/60">{`${record.result.cwd} · ${meta}`}</div>
                  {record.result.stdout ? <pre className="mt-1 whitespace-pre-wrap break-words text-emerald-100">{record.result.stdout}</pre> : null}
                  {record.result.stderr ? <pre className="mt-1 whitespace-pre-wrap break-words text-rose-300">{record.result.stderr}</pre> : null}
                </div>
              );
            })
          )}
          {running ? <div className="text-amber-300">{`$ ${command || "(running...)"}`}</div> : null}
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border/75 bg-background/80 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_COMMANDS.map((item) => (
            <Button
              key={item}
              size="sm"
              variant="outline"
              disabled={running}
              onClick={() => {
                setCommand(item);
                void runCommand(item);
              }}
            >
              {item}
            </Button>
          ))}
        </div>
        <textarea
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            if (!event.metaKey && !event.ctrlKey) return;
            event.preventDefault();
            void runCommand(command);
          }}
          placeholder="输入命令，按 Ctrl+Enter / Cmd+Enter 执行"
          className="h-24 w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-[12px] text-foreground outline-none ring-ring/40 transition focus-visible:ring-2"
        />
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">执行目录固定为当前 agent 项目根目录</div>
          <Button disabled={running || !String(command || "").trim()} onClick={() => void runCommand(command)}>
            {running ? "执行中..." : "执行命令"}
          </Button>
        </div>
        {errorText ? <div className="text-xs text-destructive">{errorText}</div> : null}
      </div>
    </section>
  );
}
