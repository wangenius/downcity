/**
 * Agent Command 主视图区。
 *
 * 关键点（中文）
 * - 提供“终端风格”的命令执行体验，不引入 PTY 依赖。
 * - 在全局 command 页面支持直接切换 agent 执行目标。
 */

import * as React from "react"
import { CheckIcon, ChevronsUpDownIcon, TerminalIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { dashboardDangerIconButtonClass, dashboardIconButtonClass } from "@/components/dashboard/dashboard-action-button"
import { DashboardModule } from "@/components/dashboard/DashboardModule"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

interface CommandRecordTone {
  /**
   * 状态标签。
   */
  label: string
  /**
   * 标签颜色样式。
   */
  badgeClassName: string
  /**
   * 行容器颜色样式。
   */
  rowClassName: string
}

/**
 * 允许自动补 `city` 前缀的一级命令。
 *
 * 关键点（中文）
 * - 仅对已知 CITY 命令做自动补全；
 * - 其他 shell 内建/系统命令（如 `clear`/`cd`/`ls`）保持原样执行。
 */
const DC_COMMAND_ROOTS = new Set([
  "init",
  "start",
  "stop",
  "console",
  "agent",
  "service",
  "plugin",
  "chat",
  "skill",
  "task",
  "memory",
  "voice",
])

const QUICK_COMMAND_GROUPS: Array<{ label: string; items: QuickCommandItem[] }> = [
  {
    label: "Console",
    items: [
      { label: "Version", command: "-v", description: "查看 CLI 版本" },
      { label: "Start DC", command: "start", description: "启动 console 与 console ui" },
      { label: "Stop DC", command: "stop", description: "停止 console（含 agent）" },
      { label: "Console Status", command: "console status", description: "查看 console 与托管 agent 状态" },
      { label: "Console Agents", command: "console agents", description: "查看 console 托管 agent 列表" },
      { label: "UI Status", command: "console ui status", description: "查看 console UI 运行状态" },
      { label: "UI Restart", command: "console ui restart", description: "重启 console UI" },
    ],
  },
  {
    label: "Agent",
    items: [
      { label: "Agent Create", command: "agent create .", description: "初始化当前目录为 agent 项目" },
      { label: "Agent Status", command: "agent status", description: "查看当前项目 agent 状态" },
      { label: "Agent Start", command: "agent start", description: "启动当前项目 agent" },
      { label: "Agent Foreground", command: "agent start --foreground", description: "以前台模式运行当前 agent" },
      { label: "Agent Restart", command: "agent restart", description: "重启当前项目 agent" },
      { label: "Agent Doctor", command: "agent doctor", description: "诊断并修复 daemon 状态文件" },
      { label: "Agent Doctor Fix", command: "agent doctor --fix", description: "自动清理僵尸 pid/meta" },
    ],
  },
  {
    label: "Config & Model",
    items: [
      { label: "Config Get", command: "console config get", description: "读取当前 downcity.json 配置" },
      { label: "Config Primary", command: "console config get model.primary", description: "读取当前项目主模型绑定" },
      { label: "Config Alias", command: "console config alias --print", description: "打印 alias city 配置片段" },
      { label: "Model List", command: "console model list", description: "列出 provider 与模型池" },
      { label: "Model Create", command: "console model create", description: "交互式创建 provider 或 model" },
      { label: "Model Discover", command: "console model discover <providerId>", description: "探测 provider 可用模型" },
      { label: "Model Use", command: "console model use <modelId>", description: "绑定当前项目 model.primary" },
      { label: "Model Test", command: "console model test provider <providerId>", description: "测试 provider 连通性" },
    ],
  },
  {
    label: "Service",
    items: [
      { label: "Service List", command: "service list", description: "列出 service 运行状态" },
      { label: "Service Chat", command: "service status chat", description: "查看 chat service 状态" },
      { label: "Service Task", command: "service status task", description: "查看 task service 状态" },
      { label: "Service Memory", command: "service status memory", description: "查看 memory service 状态" },
      { label: "Service Restart", command: "service restart chat", description: "重启 chat service" },
      { label: "Task Reload", command: "service command task reload", description: "触发 task scheduler 重载" },
    ],
  },
  {
    label: "Chat",
    items: [
      { label: "Chat Status", command: "chat status", description: "查看 chat 渠道连接状态" },
      { label: "Chat Test", command: "chat test", description: "测试 chat 渠道连通性" },
      { label: "Chat Reconnect", command: "chat reconnect", description: "重连 chat 渠道" },
      { label: "Chat Context", command: "chat context", description: "查看当前会话上下文快照" },
      { label: "Chat History", command: "chat history --limit 30", description: "读取最近聊天历史" },
      { label: "Chat Send", command: "chat send --text \"hello from city\"", description: "向当前 chatKey 发送消息" },
    ],
  },
  {
    label: "Task & Memory",
    items: [
      { label: "Task List", command: "task list", description: "列出任务定义" },
      { label: "Task Enabled", command: "task list --status enabled", description: "仅查看启用任务" },
      { label: "Task Run", command: "task run \"<taskTitle>\"", description: "手动执行指定任务" },
      { label: "Task Enable", command: "task enable \"<taskTitle>\"", description: "启用指定任务" },
      { label: "Task Disable", command: "task disable \"<taskTitle>\"", description: "禁用指定任务" },
      { label: "Memory Status", command: "memory status", description: "查看 memory backend 状态" },
      { label: "Memory Index", command: "memory index --force", description: "重建 memory 索引" },
      { label: "Memory Search", command: "memory search \"<query>\"", description: "检索记忆片段" },
    ],
  },
  {
    label: "Skill & Voice",
    items: [
      { label: "Skill List", command: "skill list", description: "列出当前已学会 skills" },
      { label: "Skill Find", command: "skill find \"<query>\"", description: "查找缺失技能" },
      { label: "Skill Lookup", command: "skill lookup \"<skillName>\"", description: "读取技能 SKILL.md 内容" },
      { label: "Voice Models", command: "voice models", description: "列出内置语音模型目录" },
      { label: "Plugin List", command: "plugin list", description: "列出当前 agent 的 plugins" },
      { label: "Voice Status", command: "voice status", description: "查看 voice plugin 配置" },
      { label: "Voice On", command: "voice on SenseVoiceSmall", description: "启用 voice 并安装默认模型" },
      { label: "Voice Use", command: "voice use SenseVoiceSmall", description: "切换 active 语音模型" },
      { label: "Voice Off", command: "voice off", description: "关闭 voice plugin" },
    ],
  },
]

/**
 * 常用命令扁平清单。
 *
 * 关键点（中文）
 * - 作为输入预测的静态候选集；
 * - 与会话命令历史合并后用于前缀匹配。
 */
const QUICK_COMMAND_CANDIDATES = QUICK_COMMAND_GROUPS.flatMap((group) =>
  group.items.map((item) => item.command),
)

export function AgentCommandSection(props: AgentCommandSectionProps) {
  const {
    selectedAgentId,
    selectedAgentName,
    agents = [],
    onSelectAgent,
    persistSelectionInUrl = true,
    onExecute,
  } = props
  const confirm = useConfirmDialog()
  const [activeAgentId, setActiveAgentId] = React.useState("")
  const [command, setCommand] = React.useState("")
  const [running, setRunning] = React.useState(false)
  const [records, setRecords] = React.useState<CommandRunRecord[]>([])
  const [commandHistory, setCommandHistory] = React.useState<string[]>([])
  const [errorText, setErrorText] = React.useState("")
  const terminalRef = React.useRef<HTMLDivElement | null>(null)
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const historyCursorRef = React.useRef(-1)
  const historyDraftRef = React.useRef("")

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

  /**
   * 解析最终执行命令（中文）
   * - 已显式输入 `city|downcity ...`：保持原样。
   * - 首 token 是 CITY 已知命令/全局参数（`-v`）：自动补 `city`。
   * - 其他命令（clear/cd/ls/...）：按原始 shell 命令执行。
   */
  const resolveExecutionCommand = React.useCallback((commandTextInput: string): string => {
    const raw = String(commandTextInput || "").trim()
    if (!raw) return ""
    if (/^(?:city|downcity)(?:\s|$)/i.test(raw)) return raw
    const firstToken = String(raw.split(/\s+/, 1)[0] || "").trim().toLowerCase()
    if (!firstToken) return ""
    const shouldPrefix = firstToken.startsWith("-") || DC_COMMAND_ROOTS.has(firstToken)
    if (shouldPrefix) return `city ${raw}`
    return raw
  }, [])

  /**
   * 解析命令结果的视觉状态（中文）
   * - success / error / timeout 三态明确区分，降低颜色歧义。
   */
  const resolveRecordTone = React.useCallback((result: UiCommandExecuteResult): CommandRecordTone => {
    if (result.timedOut) {
      return {
        label: "timeout",
        badgeClassName: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
        rowClassName: "border-amber-500/35",
      }
    }
    const hasErrorOutput = Boolean(String(result.stderr || "").trim())
    const failed = hasErrorOutput || Number(result.exitCode ?? 0) !== 0
    if (failed) {
      return {
        label: "error",
        badgeClassName: "bg-destructive/10 text-destructive",
        rowClassName: "border-destructive/40",
      }
    }
    return {
      label: "success",
      badgeClassName: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
      rowClassName: "border-emerald-500/35",
    }
  }, [])

  /**
   * 记录命令历史（中文）
   * - 去重并保留最近 120 条；
   * - 仅记录非空命令，供输入预测与上下键历史导航复用。
   */
  const rememberCommand = React.useCallback((commandTextInput: string) => {
    const normalized = String(commandTextInput || "").trim()
    if (!normalized) return
    setCommandHistory((prev) => {
      const deduplicated = prev.filter((item) => item !== normalized)
      const merged = [...deduplicated, normalized]
      if (merged.length <= 120) return merged
      return merged.slice(merged.length - 120)
    })
    historyCursorRef.current = -1
    historyDraftRef.current = ""
  }, [])

  /**
   * 输入框值变更（中文）
   * - 用户手动输入时重置历史浏览游标，避免和 ↑/↓ 导航状态冲突。
   */
  const updateCommandInput = React.useCallback((value: string) => {
    historyCursorRef.current = -1
    historyDraftRef.current = ""
    setCommand(value)
  }, [])

  /**
   * 命令历史导航（中文）
   * - `↑` 浏览更早命令；
   * - `↓` 回到更新命令，尾部再按一次恢复当前输入草稿。
   */
  const navigateCommandHistory = React.useCallback((direction: "up" | "down") => {
    if (commandHistory.length === 0) return

    if (direction === "up") {
      if (historyCursorRef.current === -1) {
        historyDraftRef.current = command
        historyCursorRef.current = commandHistory.length - 1
      } else {
        historyCursorRef.current = Math.max(0, historyCursorRef.current - 1)
      }
      setCommand(commandHistory[historyCursorRef.current] || "")
      return
    }

    if (historyCursorRef.current === -1) return
    if (historyCursorRef.current >= commandHistory.length - 1) {
      historyCursorRef.current = -1
      setCommand(historyDraftRef.current)
      return
    }
    historyCursorRef.current += 1
    setCommand(commandHistory[historyCursorRef.current] || "")
  }, [command, commandHistory])

  /**
   * 输入预测候选集（中文）
   * - 优先使用最近执行命令（倒序）；
   * - 常用命令作为兜底，提高首输命中率。
   */
  const suggestionCandidates = React.useMemo(() => {
    const result: string[] = []
    const dedup = new Set<string>()

    for (let index = commandHistory.length - 1; index >= 0; index -= 1) {
      const item = String(commandHistory[index] || "").trim()
      if (!item || dedup.has(item)) continue
      dedup.add(item)
      result.push(item)
    }

    for (const item of [...QUICK_COMMAND_CANDIDATES, "clear", "cls"]) {
      const commandText = String(item || "").trim()
      if (!commandText || dedup.has(commandText)) continue
      dedup.add(commandText)
      result.push(commandText)
    }
    return result
  }, [commandHistory])

  /**
   * 原地预测命令（中文）
   * - 仅做“前缀补全”，不做语义改写；
   * - 输入完整命令时不重复提示。
   */
  const inlineSuggestion = React.useMemo(() => {
    const current = String(command || "")
    if (!current.trim()) return ""
    const normalizedCurrent = current.toLowerCase()
    const matched = suggestionCandidates.find((candidate) => {
      const normalizedCandidate = candidate.toLowerCase()
      if (normalizedCandidate === normalizedCurrent) return false
      return normalizedCandidate.startsWith(normalizedCurrent)
    })
    return matched || ""
  }, [command, suggestionCandidates])

  const inlineSuggestionSuffix = React.useMemo(() => {
    if (!inlineSuggestion) return ""
    const suffix = inlineSuggestion.slice(command.length)
    return suffix
  }, [command, inlineSuggestion])

  /**
   * 接受预测文本（中文）
   * - `full`：接受整条预测；
   * - `word`：仅接受下一个词（含后随空格），用于细粒度补全。
   */
  const acceptInlineSuggestion = React.useCallback((mode: "full" | "word"): boolean => {
    if (!inlineSuggestion || !inlineSuggestionSuffix) return false
    if (mode === "full") {
      setCommand(inlineSuggestion)
      return true
    }

    const leadingWhitespace = inlineSuggestionSuffix.match(/^\s*/)?.[0] || ""
    const body = inlineSuggestionSuffix.slice(leadingWhitespace.length)
    if (!body) {
      setCommand(inlineSuggestion)
      return true
    }

    const tokenMatch = body.match(/^[^\s]+/)
    const token = tokenMatch ? tokenMatch[0] : body
    const trailingWhitespace = body.slice(token.length).match(/^\s*/)?.[0] || ""
    setCommand((prev) => `${prev}${leadingWhitespace}${token}${trailingWhitespace}`)
    return true
  }, [inlineSuggestion, inlineSuggestionSuffix])

  const runCommand = React.useCallback(
    async (commandTextInput: string) => {
      const rawInput = String(commandTextInput || "").trim()
      const localCommand = rawInput.toLowerCase()

      // 关键点（中文）：`clear/cls` 作为本地清屏命令处理，不走后端 shell，
      // 避免 non-tty 输出 ANSI 控制字符（如 `\x1b[3J\x1b[H\x1b[2J`）。
      if (localCommand === "clear" || localCommand === "cls") {
        setRecords([])
        setErrorText("")
        setCommand("")
        return
      }

      const commandText = resolveExecutionCommand(commandTextInput)
      if (!commandText || running || !activeAgentId) return
      rememberCommand(rawInput)
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
    [activeAgentId, onExecute, rememberCommand, resolveExecutionCommand, running],
  )

  React.useEffect(() => {
    terminalRef.current?.scrollTo({
      top: terminalRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [records.length, running])

  const activeAgentBadge = activeAgentId ? activeAgentName : "未选择 agent"

  return (
    <DashboardModule
      title="Command"
      description="在当前 agent 上直接执行命令，输出按会话顺序保留。"
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      bodyClassName="flex min-h-0 flex-1 flex-col"
      actions={
        <>
          {agents.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex min-w-[11rem] max-w-[16rem] items-center gap-2 rounded-[11px] bg-secondary/85 px-2.5 text-left outline-none transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/30"
                aria-label="选择 agent"
              >
                <div className="min-w-0 flex-1 leading-none">
                  <div className="mb-1 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                    Agent
                  </div>
                  <div className="max-w-[12rem] truncate text-left text-[12px] text-foreground">
                    {activeAgentBadge}
                  </div>
                </div>
                <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[24rem] max-w-[calc(100vw-2rem)]">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>选择 agent</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {agents.map((agent) => {
                    const id = String(agent.id || "").trim()
                    if (!id) return null
                    const isActive = id === activeAgentId
                    return (
                      <DropdownMenuItem
                        key={id}
                        onClick={() => {
                          setActiveAgentId(id)
                          onSelectAgent?.(id)
                        }}
                        className="justify-between gap-2"
                      >
                        <span className="truncate">{agent.name || id}</span>
                        {isActive ? <CheckIcon className="size-3.5 text-primary" /> : null}
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="inline-flex items-center rounded-[11px] bg-secondary/85 px-2.5">
              <div className="leading-none">
                <div className="mb-1 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  Agent
                </div>
                <div className="text-[12px] text-foreground">{activeAgentBadge}</div>
              </div>
            </div>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              void (async () => {
                const confirmed = await confirm({
                  title: "清空输出",
                  description: "确认清空当前命令输出记录吗？",
                  confirmText: "清空",
                  confirmVariant: "destructive",
                })
                if (!confirmed) return
                setRecords([])
              })()
            }}
            disabled={running || records.length === 0}
            className={dashboardDangerIconButtonClass}
            aria-label="清空输出"
            title="清空输出"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </>
      }
    >
      <div className="min-h-0 flex-1 rounded-[20px] bg-secondary p-2">
        <div
          ref={terminalRef}
          className="h-full overflow-auto rounded-[18px] px-3 py-3 font-mono text-[12px] leading-relaxed text-foreground/92"
        >
          {records.length === 0 ? (
            <div className="text-muted-foreground">
              {`# 当前 agent: ${activeAgentName || activeAgentId || "-"}`}
              <br />
              {"# 输入命令并执行，输出会记录在这里"}
            </div>
          ) : (
            records.map((record) => {
              const meta = `exit=${String(record.result.exitCode ?? "-")} · ${record.result.durationMs}ms${record.result.timedOut ? " · timeout" : ""}`
              const tone = resolveRecordTone(record.result)
              return (
                <div
                  key={record.id}
                  className={`mb-4 border-l-2 pl-3 last:mb-0 ${tone.rowClassName}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="text-foreground">{`$ ${record.result.command}`}</div>
                    <span className={`inline-flex rounded-[10px] px-1.5 py-0.5 text-[10px] leading-none ${tone.badgeClassName}`}>
                      {tone.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{`${record.result.cwd} · ${meta}`}</div>
                  {record.result.stdout ? <pre className="mt-1 whitespace-pre-wrap break-words text-foreground/95">{record.result.stdout}</pre> : null}
                  {record.result.stderr ? (
                    <pre className="mt-1 whitespace-pre-wrap break-words rounded-[10px] bg-destructive/6 px-2 py-1 text-destructive">
                      {record.result.stderr}
                    </pre>
                  ) : null}
                </div>
              )
            })
          )}
          {running ? <div className="text-primary/80">{`$ ${resolveExecutionCommand(command) || "(running...)"}`}</div> : null}
        </div>
      </div>

      <div className="space-y-2 rounded-[20px] bg-secondary px-3 py-3">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={running || !activeAgentId}
              className={`inline-flex shrink-0 items-center justify-center disabled:pointer-events-none disabled:opacity-50 ${dashboardIconButtonClass}`}
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
                          updateCommandInput(item.command)
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
          <div className="relative flex h-9 flex-1 items-center rounded-[14px] bg-background px-3">
            <span className="mr-2 font-mono text-xs text-muted-foreground">$</span>
            <div className="relative flex-1">
              {inlineSuggestionSuffix ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 z-0 flex h-8 items-center overflow-hidden font-mono text-[12px]"
                >
                  <span className="invisible whitespace-pre">{command}</span>
                  <span className="whitespace-pre text-muted-foreground/45">{inlineSuggestionSuffix}</span>
                </div>
              ) : null}
              <input
                ref={inputRef}
                value={command}
                onChange={(event) => updateCommandInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    void runCommand(command)
                    return
                  }
                  if (event.key === "Tab") {
                    const accepted = acceptInlineSuggestion("full")
                    if (accepted) event.preventDefault()
                    return
                  }
                  if (event.key === "ArrowRight" && (event.ctrlKey || event.metaKey)) {
                    const accepted = acceptInlineSuggestion("word")
                    if (accepted) event.preventDefault()
                    return
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault()
                    navigateCommandHistory("up")
                    return
                  }
                  if (event.key === "ArrowDown") {
                    event.preventDefault()
                    navigateCommandHistory("down")
                  }
                }}
                placeholder="输入命令后按回车执行（CITY 命令可省略 city）"
                className="relative z-10 h-8 w-full bg-transparent font-mono text-[12px] text-foreground outline-none placeholder:text-muted-foreground/80"
              />
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={running || !activeAgentId || !String(command || "").trim()}
            onClick={() => void runCommand(command)}
            className="h-9 px-3"
          >
            执行
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground/80">
          <span>Tab 接受预测 · Ctrl/⌘ + → 接受下一个词 · ↑/↓ 浏览历史命令</span>
          {!activeAgentId ? <span className="text-destructive">请先选择 agent</span> : null}
          {errorText ? <span className="text-destructive">{errorText}</span> : null}
        </div>
      </div>
    </DashboardModule>
  )
}
