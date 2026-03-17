/**
 * Agent Command 主视图区。
 *
 * 关键点（中文）
 * - 提供“终端风格”的命令执行体验，不引入 PTY 依赖。
 * - 在全局 command 页面支持直接切换 agent 执行目标。
 */

import * as React from "react"
import { TerminalIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { UiAgentOption, UiCommandExecuteResult } from "@/types/Dashboard"

interface CommandRunRecord {
  /**
   * 本地记录唯一 id。
   */
  id: string
  /**
   * 执行结果快照。
   */
  result: UiCommandExecuteResult
}

export interface AgentCommandSectionProps {
  /**
   * 当前选中 agent id。
   */
  selectedAgentId: string
  /**
   * 当前选中 agent 展示名。
   */
  selectedAgentName: string
  /**
   * 可切换 agent 列表（全局 command 场景）。
   */
  agents?: UiAgentOption[]
  /**
   * 切换执行目标 agent。
   */
  onSelectAgent?: (agentId: string) => void
  /**
   * 是否把选择的 agent 持久化到 URL query（`?agent=`）。
   */
  persistSelectionInUrl?: boolean
  /**
   * 执行 command 回调。
   */
  onExecute: (input: {
    command: string
    timeoutMs?: number
    agentId?: string
  }) => Promise<UiCommandExecuteResult>
}

interface QuickCommandItem {
  /**
   * 菜单文案。
   */
  label: string
  /**
   * 要填充到输入框的命令。
   */
  command: string
  /**
   * 命令简述。
   */
  description: string
}

const QUICK_COMMAND_GROUPS: Array<{ label: string; items: QuickCommandItem[] }> = [
  {
    label: "Console",
    items: [
      { label: "Version", command: "sma -v", description: "查看 CLI 版本" },
      { label: "Start SMA", command: "sma start", description: "启动 console 与 console ui" },
      { label: "Stop SMA", command: "sma stop", description: "停止 console（含 agent）" },
      { label: "Console Status", command: "sma console status", description: "查看 console 与托管 agent 状态" },
      { label: "UI Status", command: "sma console ui status", description: "查看 console UI 运行状态" },
    ],
  },
  {
    label: "Agent",
    items: [
      { label: "Agent Status", command: "sma agent status", description: "查看当前项目 agent 状态" },
      { label: "Agent Start", command: "sma agent start", description: "启动当前项目 agent" },
      { label: "Agent Restart", command: "sma agent restart", description: "重启当前项目 agent" },
      { label: "Agent Doctor", command: "sma agent doctor", description: "诊断并修复 daemon 状态文件" },
    ],
  },
  {
    label: "Inspect",
    items: [
      { label: "Service List", command: "sma service list", description: "列出服务状态与配置" },
      { label: "Extension List", command: "sma extension list", description: "列出 extension 状态与配置" },
      { label: "Model List", command: "sma model list", description: "列出模型与 provider" },
      { label: "Config Get", command: "sma config get", description: "读取 console 配置" },
    ],
  },
]

export function AgentCommandSection(props: AgentCommandSectionProps) {
  const {
    selectedAgentId,
    selectedAgentName,
    agents = [],
    onSelectAgent,
    persistSelectionInUrl = true,
    onExecute,
  } = props
  const [activeAgentId, setActiveAgentId] = React.useState("")
  const [command, setCommand] = React.useState("")
  const [running, setRunning] = React.useState(false)
  const [records, setRecords] = React.useState<CommandRunRecord[]>([])
  const [errorText, setErrorText] = React.useState("")
  const terminalRef = React.useRef<HTMLDivElement | null>(null)
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  const resolvePreferredAgentId = React.useCallback(() => {
    const normalizedAgents = agents.map((item) => ({
      id: String(item.id || "").trim(),
      running: item.running === true,
    })).filter((item) => item.id)
    if (normalizedAgents.length === 0) return ""

    const queryAgentId = (() => {
      if (!persistSelectionInUrl || typeof window === "undefined") return ""
      const fromQuery = String(new URLSearchParams(window.location.search).get("agent") || "").trim()
      if (!fromQuery) return ""
      return normalizedAgents.find((item) => item.id === fromQuery)?.id || ""
    })()
    if (queryAgentId) return queryAgentId

    const preferredFromProps = String(selectedAgentId || "").trim()
    if (preferredFromProps && normalizedAgents.some((item) => item.id === preferredFromProps)) {
      return preferredFromProps
    }

    const firstRunning = normalizedAgents.find((item) => item.running)?.id || ""
    if (firstRunning) return firstRunning
    return normalizedAgents[0]?.id || ""
  }, [agents, persistSelectionInUrl, selectedAgentId])

  React.useEffect(() => {
    const next = resolvePreferredAgentId()
    setActiveAgentId((prev) => {
      if (prev && agents.some((item) => String(item.id || "").trim() === prev)) return prev
      return next
    })
  }, [agents, resolvePreferredAgentId])

  React.useEffect(() => {
    if (!persistSelectionInUrl) return
    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    const current = String(url.searchParams.get("agent") || "").trim()
    if (!activeAgentId) {
      if (!current) return
      url.searchParams.delete("agent")
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`)
      return
    }
    if (current === activeAgentId) return
    url.searchParams.set("agent", activeAgentId)
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`)
  }, [activeAgentId, persistSelectionInUrl])

  const activeAgent = React.useMemo(
    () => agents.find((item) => String(item.id || "") === activeAgentId) ?? null,
    [activeAgentId, agents],
  )
  const activeAgentName = String(activeAgent?.name || selectedAgentName || activeAgentId || "agent").trim() || "agent"

  const runCommand = React.useCallback(
    async (commandTextInput: string) => {
      const commandText = String(commandTextInput || "").trim()
      if (!commandText || running || !activeAgentId) return
      setRunning(true)
      setErrorText("")
      try {
        const result = await onExecute({
          command: commandText,
          timeoutMs: 45_000,
          agentId: activeAgentId,
        })
        setRecords((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            result,
          },
        ])
        setCommand("")
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : String(error))
      } finally {
        setRunning(false)
      }
    },
    [activeAgentId, onExecute, running],
  )

  React.useEffect(() => {
    terminalRef.current?.scrollTo({
      top: terminalRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [records.length, running])

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/70 px-3 py-2">
        <div className="min-w-0 flex-1">
          {agents.length > 0 ? (
            <Select
              value={activeAgentId}
              onValueChange={(value) => {
                const next = String(value || "").trim()
                setActiveAgentId(next)
                onSelectAgent?.(next)
              }}
            >
              <SelectTrigger className="h-8 min-w-[14rem] max-w-[24rem]">
                <SelectValue placeholder="选择 agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => {
                  const id = String(agent.id || "").trim()
                  if (!id) return null
                  return (
                    <SelectItem key={id} value={id}>
                      {agent.name || id}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          ) : null}
        </div>
        <span className="truncate text-xs text-muted-foreground">{activeAgentName}</span>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setRecords([])}
          disabled={running || records.length === 0}
          className="size-7 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          aria-label="清空输出"
          title="清空输出"
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 bg-black/[0.94] p-3 text-[12px] text-emerald-100">
        <div ref={terminalRef} className="h-full overflow-auto font-mono leading-relaxed">
          {records.length === 0 ? (
            <div className="text-emerald-300/70">
              {`# 当前 agent: ${activeAgentName || activeAgentId || "-"}`}
              <br />
              {"# 输入命令并执行，输出会记录在这里"}
            </div>
          ) : (
            records.map((record) => {
              const meta = `exit=${String(record.result.exitCode ?? "-")} · ${record.result.durationMs}ms${record.result.timedOut ? " · timeout" : ""}`
              return (
                <div key={record.id} className="mb-3">
                  <div className="text-sky-200">{`$ ${record.result.command}`}</div>
                  <div className="text-[11px] text-emerald-300/60">{`${record.result.cwd} · ${meta}`}</div>
                  {record.result.stdout ? <pre className="mt-1 whitespace-pre-wrap break-words text-emerald-100">{record.result.stdout}</pre> : null}
                  {record.result.stderr ? <pre className="mt-1 whitespace-pre-wrap break-words text-rose-300">{record.result.stderr}</pre> : null}
                </div>
              )
            })
          )}
          {running ? <div className="text-amber-300">{`$ ${command || "(running...)"}`}</div> : null}
        </div>
      </div>

      <div className="shrink-0 border-t border-border/70 bg-background px-3 py-3">
        <div className="rounded-md border border-border/80 bg-muted/20 px-2 py-1.5">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={running || !activeAgentId}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/80 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                aria-label="常用命令"
                title="常用命令"
              >
                <TerminalIcon className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[24rem]">
                {QUICK_COMMAND_GROUPS.map((group, groupIndex) => (
                  <React.Fragment key={group.label}>
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                        {group.label}
                      </DropdownMenuLabel>
                      {group.items.map((item) => (
                        <DropdownMenuItem
                          key={`${group.label}:${item.command}`}
                          onClick={() => {
                            setCommand(item.command)
                            requestAnimationFrame(() => inputRef.current?.focus())
                          }}
                          className="items-start py-2"
                        >
                          <span className="grid min-w-0 gap-0.5">
                            <span className="truncate text-[12px] font-medium text-foreground">{item.label}</span>
                            <span className="truncate font-mono text-[11px] text-muted-foreground">{item.command}</span>
                            <span className="truncate text-[11px] text-muted-foreground/90">{item.description}</span>
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                    {groupIndex < QUICK_COMMAND_GROUPS.length - 1 ? <DropdownMenuSeparator /> : null}
                  </React.Fragment>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="font-mono text-xs text-muted-foreground">$</span>
            <input
              ref={inputRef}
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                void runCommand(command)
              }}
              placeholder="输入命令并回车执行"
              className="h-8 flex-1 bg-transparent font-mono text-[12px] text-foreground outline-none placeholder:text-muted-foreground/80"
            />
            <Button
              size="sm"
              disabled={running || !activeAgentId || !String(command || "").trim()}
              onClick={() => void runCommand(command)}
            >
              {running ? "执行中..." : "运行"}
            </Button>
          </div>
        </div>

        {!activeAgentId ? <div className="pt-2 text-xs text-destructive">请先选择 agent</div> : null}
        {errorText ? <div className="pt-2 text-xs text-destructive">{errorText}</div> : null}
      </div>
    </section>
  )
}
