/**
 * Skills 主视图。
 *
 * 关键点（中文）
 * - 使用表格集中展示 skills 元信息，避免卡片化带来的信息密度损失。
 * - 提供 find/install 管理动作，并将安装参数作为可配置项暴露。
 * - 页面内维护最近一次动作反馈，帮助用户在同一视图内完成“管理 + 配置”闭环。
 */

import * as React from "react"
import { Loader2Icon, RefreshCcwIcon, SearchIcon, Settings2Icon, WrenchIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type {
  UiSkillFindResult,
  UiSkillInstallPayload,
  UiSkillInstallResult,
  UiSkillSummaryItem,
} from "@/types/Dashboard"

interface SkillActionReport {
  /**
   * 动作标题（find/install）。
   */
  title: string
  /**
   * 主结果文案。
   */
  message: string
  /**
   * 推荐下一步动作。
   */
  nextAction?: string
  /**
   * 推荐工作流。
   */
  workflow?: string[]
}

export interface SkillsSectionProps {
  /**
   * skills 列表快照。
   */
  skills: UiSkillSummaryItem[]
  /**
   * 全局加载状态。
   */
  loading: boolean
  /**
   * 当前选中 agent id。
   */
  selectedAgentId: string
  /**
   * 刷新 skills。
   */
  onRefreshSkills: () => Promise<void>
  /**
   * 触发 find。
   */
  onFindSkill: (query: string) => Promise<UiSkillFindResult | null>
  /**
   * 触发 install。
   */
  onInstallSkill: (input: UiSkillInstallPayload) => Promise<UiSkillInstallResult | null>
}

function normalizeSourceLabel(raw: string): string {
  const value = String(raw || "").trim().toLowerCase()
  if (!value) return "unknown"
  if (value === "project" || value === "home" || value === "external") return value
  return "other"
}

export function SkillsSection(props: SkillsSectionProps) {
  const {
    skills,
    loading,
    selectedAgentId,
    onRefreshSkills,
    onFindSkill,
    onInstallSkill,
  } = props
  const [search, setSearch] = React.useState("")
  const [findQuery, setFindQuery] = React.useState("")
  const [installSpec, setInstallSpec] = React.useState("")
  const [installConfigOpen, setInstallConfigOpen] = React.useState(false)
  const [installGlobal, setInstallGlobal] = React.useState(true)
  const [installYes, setInstallYes] = React.useState(true)
  const [installAgent, setInstallAgent] = React.useState("claude-code")
  const [actionLoadingKey, setActionLoadingKey] = React.useState("")
  const [actionReport, setActionReport] = React.useState<SkillActionReport | null>(null)

  const hasAgent = Boolean(String(selectedAgentId || "").trim())
  const query = search.trim().toLowerCase()

  // 关键点（中文）：统一在前端做轻量过滤，保证表格交互即时反馈。
  const filteredSkills = React.useMemo(() => {
    if (!query) return skills
    return skills.filter((item) => {
      const id = String(item.id || "").toLowerCase()
      const name = String(item.name || "").toLowerCase()
      const description = String(item.description || "").toLowerCase()
      const source = String(item.source || "").toLowerCase()
      const path = String(item.skillMdPath || "").toLowerCase()
      const tools = Array.isArray(item.allowedTools) ? item.allowedTools.join(" ").toLowerCase() : ""
      return id.includes(query) || name.includes(query) || description.includes(query) || source.includes(query) || path.includes(query) || tools.includes(query)
    })
  }, [query, skills])

  const sourceSummary = React.useMemo(() => {
    const summary = {
      project: 0,
      home: 0,
      external: 0,
      other: 0,
    }
    for (const item of filteredSkills) {
      const key = normalizeSourceLabel(String(item.source || "")) as keyof typeof summary
      summary[key] += 1
    }
    return summary
  }, [filteredSkills])

  const handleFind = React.useCallback(async () => {
    const normalizedQuery = String(findQuery || "").trim()
    if (!normalizedQuery) return
    try {
      setActionLoadingKey("find")
      const result = await onFindSkill(normalizedQuery)
      setActionReport({
        title: "Find",
        message: result?.message || `已执行 find: ${normalizedQuery}`,
        nextAction: result?.nextAction,
        workflow: result?.workflow,
      })
    } finally {
      setActionLoadingKey("")
    }
  }, [findQuery, onFindSkill])

  const handleInstall = React.useCallback(async () => {
    const spec = String(installSpec || "").trim()
    if (!spec) return
    try {
      setActionLoadingKey("install")
      const result = await onInstallSkill({
        spec,
        global: installGlobal,
        yes: installYes,
        agent: String(installAgent || "").trim() || "claude-code",
      })
      setActionReport({
        title: "Install",
        message: result?.message || `已执行 install: ${spec}`,
        nextAction: result?.nextAction,
        workflow: result?.workflow,
      })
    } finally {
      setActionLoadingKey("")
    }
  }, [installAgent, installGlobal, installSpec, installYes, onInstallSkill])

  return (
    <section className="min-h-0 space-y-3 overflow-y-auto px-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
            total {filteredSkills.length}
          </span>
          <span className="inline-flex items-center rounded-full bg-foreground/8 px-2 py-0.5 text-foreground/85">
            project {sourceSummary.project}
          </span>
          <span className="inline-flex items-center rounded-full bg-foreground/8 px-2 py-0.5 text-foreground/85">
            home {sourceSummary.home}
          </span>
          <span className="inline-flex items-center rounded-full bg-foreground/8 px-2 py-0.5 text-foreground/85">
            external {sourceSummary.external}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索 skills"
              className="h-8 w-[220px] pl-7"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={loading || !hasAgent}
            onClick={() => void onRefreshSkills()}
          >
            <RefreshCcwIcon className={`mr-1 size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
        <Input
          value={findQuery}
          onChange={(event) => setFindQuery(event.target.value)}
          placeholder="find query，例如 playwright"
          className="h-9"
        />
        <Input
          value={installSpec}
          onChange={(event) => setInstallSpec(event.target.value)}
          placeholder="install spec，例如 owner/repo@playwright"
          className="h-9"
        />
        <Button
          variant="outline"
          className="h-9 min-w-22"
          disabled={!hasAgent || actionLoadingKey === "install" || actionLoadingKey === "find"}
          onClick={() => void handleFind()}
        >
          {actionLoadingKey === "find" ? <Loader2Icon className="mr-1 size-4 animate-spin" /> : <SearchIcon className="mr-1 size-4" />}
          Find
        </Button>
        <Button
          variant="outline"
          className="h-9 min-w-22"
          disabled={!hasAgent || actionLoadingKey === "install" || actionLoadingKey === "find"}
          onClick={() => void handleInstall()}
        >
          {actionLoadingKey === "install" ? <Loader2Icon className="mr-1 size-4 animate-spin" /> : <WrenchIcon className="mr-1 size-4" />}
          Install
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-xs text-muted-foreground">
        <div className="truncate">
          <span className="font-medium text-foreground/85">Install Config:</span>{" "}
          {`global=${String(installGlobal)} · yes=${String(installYes)} · agent=${String(installAgent || "claude-code")}`}
        </div>
        <Button size="sm" variant="outline" className="h-7" onClick={() => setInstallConfigOpen(true)}>
          <Settings2Icon className="mr-1 size-3.5" />
          配置
        </Button>
      </div>

      {actionReport ? (
        <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs">
          <div className="font-medium text-foreground">{actionReport.title}</div>
          <div className="mt-0.5 text-muted-foreground">{actionReport.message}</div>
          {actionReport.nextAction ? (
            <div className="mt-1 text-muted-foreground">{`next: ${actionReport.nextAction}`}</div>
          ) : null}
          {Array.isArray(actionReport.workflow) && actionReport.workflow.length > 0 ? (
            <div className="mt-1 text-muted-foreground">{`workflow: ${actionReport.workflow.join(" -> ")}`}</div>
          ) : null}
        </div>
      ) : null}

      {filteredSkills.length === 0 ? (
        <div className="py-8 text-sm text-muted-foreground">
          {query ? "没有匹配的 skills。" : "暂无 skills。"}
        </div>
      ) : (
        <div>
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                <th className="py-2 text-left font-medium">Skill</th>
                <th className="w-[120px] py-2 text-left font-medium">Source</th>
                <th className="w-[260px] py-2 text-left font-medium">Allowed Tools</th>
                <th className="w-[420px] py-2 text-left font-medium">SKILL.md</th>
              </tr>
            </thead>
            <tbody>
              {filteredSkills.map((item) => {
                const id = String(item.id || "unknown")
                const name = String(item.name || "unknown")
                const source = normalizeSourceLabel(String(item.source || ""))
                const description = String(item.description || "").trim()
                const tools = Array.isArray(item.allowedTools) ? item.allowedTools : []
                const path = String(item.skillMdPath || "").trim() || "-"
                return (
                  <tr key={`${source}:${id}`} className="align-middle text-foreground">
                    <td className="py-2 pr-3">
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-semibold">{name}</div>
                        <div className="truncate font-mono text-[11px] text-muted-foreground">{id}</div>
                        {description ? <div className="truncate text-[12px] text-muted-foreground">{description}</div> : null}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-[11px] text-muted-foreground">
                        {source}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {tools.length === 0 ? (
                          <span className="text-xs text-muted-foreground">-</span>
                        ) : (
                          tools.map((tool) => (
                            <span
                              key={`${id}:${tool}`}
                              className="inline-flex h-5 items-center rounded-full bg-foreground/8 px-2 font-mono text-[11px] text-foreground/85"
                            >
                              {tool}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="block truncate font-mono text-[11px] text-muted-foreground" title={path}>
                        {path}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={installConfigOpen} onOpenChange={setInstallConfigOpen}>
        <DialogContent className="w-[min(92vw,520px)]">
          <DialogHeader>
            <DialogTitle>Install 配置</DialogTitle>
            <DialogDescription>
              设置 `sma skill install` 的默认参数。配置会用于当前页面的 Install 操作。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-foreground">Agent</div>
              <Input
                value={installAgent}
                onChange={(event) => setInstallAgent(event.target.value)}
                placeholder="claude-code"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={installGlobal ? "default" : "outline"}
                size="sm"
                onClick={() => setInstallGlobal((prev) => !prev)}
              >
                {`global: ${installGlobal ? "on" : "off"}`}
              </Button>
              <Button
                type="button"
                variant={installYes ? "default" : "outline"}
                size="sm"
                onClick={() => setInstallYes((prev) => !prev)}
              >
                {`yes: ${installYes ? "on" : "off"}`}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstallConfigOpen(false)}>
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
