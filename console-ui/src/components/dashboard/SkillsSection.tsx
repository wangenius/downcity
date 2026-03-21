/**
 * Skills 主视图。
 *
 * 关键点（中文）
 * - 使用统一的 DashboardModule 组织 Skills、Find / Install、Action Report 三个区块。
 * - 列表采用“外层浅灰工作台 + 内层透明行，hover 变白”的统一结构。
 * - 保留 find/install/config 的完整能力，但去掉旧的表格管理感。
 */

import * as React from "react"
import {
  Loader2Icon,
  RefreshCcwIcon,
  SearchIcon,
  Settings2Icon,
  WrenchIcon,
} from "lucide-react"
import { DashboardModule } from "@/components/dashboard/DashboardModule"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

function SurfaceTag(props: { tone?: "default" | "strong"; children: React.ReactNode }) {
  return (
    <span
      className={
        props.tone === "strong"
          ? "inline-flex h-6 items-center rounded-full bg-background px-2.5 text-[11px] text-foreground"
          : "inline-flex h-6 items-center rounded-full bg-background/80 px-2.5 text-[11px] text-muted-foreground"
      }
    >
      {props.children}
    </span>
  )
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

  /**
   * 关键点（中文）：列表过滤保持在前端完成，避免每次输入都触发外部请求。
   */
  const filteredSkills = React.useMemo(() => {
    if (!query) return skills
    return skills.filter((item) => {
      const id = String(item.id || "").toLowerCase()
      const name = String(item.name || "").toLowerCase()
      const description = String(item.description || "").toLowerCase()
      const source = String(item.source || "").toLowerCase()
      const path = String(item.skillMdPath || "").toLowerCase()
      const tools = Array.isArray(item.allowedTools)
        ? item.allowedTools.join(" ").toLowerCase()
        : ""
      return (
        id.includes(query) ||
        name.includes(query) ||
        description.includes(query) ||
        source.includes(query) ||
        path.includes(query) ||
        tools.includes(query)
      )
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
    <section className="space-y-4">
      <DashboardModule
        title="Skills"
        actions={
          <>
            <SurfaceTag tone="strong">{`total ${filteredSkills.length}`}</SurfaceTag>
            <SurfaceTag>{`project ${sourceSummary.project}`}</SurfaceTag>
            <SurfaceTag>{`home ${sourceSummary.home}`}</SurfaceTag>
            <SurfaceTag>{`external ${sourceSummary.external}`}</SurfaceTag>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索 skills"
                className="w-[220px] pl-8"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={loading || !hasAgent}
              onClick={() => void onRefreshSkills()}
            >
              <RefreshCcwIcon className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </>
        }
      >
        {filteredSkills.length === 0 ? (
          <div className="rounded-[18px] bg-secondary/85 px-4 py-8 text-sm text-muted-foreground">
            {query ? "没有匹配的 skills。" : "暂无 skills。"}
          </div>
        ) : (
          <div className="rounded-[18px] bg-secondary/85 p-2">
            {filteredSkills.map((item) => {
              const id = String(item.id || "unknown")
              const name = String(item.name || "unknown")
              const source = normalizeSourceLabel(String(item.source || ""))
              const description = String(item.description || "").trim()
              const tools = Array.isArray(item.allowedTools) ? item.allowedTools : []
              const path = String(item.skillMdPath || "").trim() || "-"
              const meta = [source, tools.length > 0 ? tools.join(", ") : "no tools"]
                .filter(Boolean)
                .join(" · ")

              return (
                <div
                  key={`${source}:${id}`}
                  className="group rounded-[14px] bg-transparent px-3 py-3 transition-colors hover:bg-background"
                >
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="truncate text-sm font-medium text-foreground">{name}</div>
                        <span className="inline-flex h-5 items-center rounded-full bg-background px-2 text-[11px] text-muted-foreground">
                          {source}
                        </span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{id}</div>
                      {description ? (
                        <div className="truncate text-xs text-muted-foreground">{description}</div>
                      ) : null}
                    </div>
                    <div className="min-w-0 text-left lg:max-w-[42rem] lg:text-right">
                      <div className="truncate text-xs text-muted-foreground">{meta}</div>
                      <div
                        className="truncate font-mono text-[11px] text-muted-foreground/90"
                        title={path}
                      >
                        {path}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DashboardModule>

      <DashboardModule
        title="Find / Install"
        actions={
          <>
            <SurfaceTag>{`global ${String(installGlobal)}`}</SurfaceTag>
            <SurfaceTag>{`yes ${String(installYes)}`}</SurfaceTag>
            <SurfaceTag>{`agent ${String(installAgent || "claude-code")}`}</SurfaceTag>
            <Button size="sm" variant="outline" onClick={() => setInstallConfigOpen(true)}>
              <Settings2Icon className="size-3.5" />
            </Button>
          </>
        }
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-[18px] bg-secondary/85 p-2">
            <div className="rounded-[14px] bg-transparent px-3 py-3">
              <div className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Find
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={findQuery}
                  onChange={(event) => setFindQuery(event.target.value)}
                  placeholder="例如 playwright"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  className="sm:min-w-24"
                  disabled={!hasAgent || actionLoadingKey === "install" || actionLoadingKey === "find"}
                  onClick={() => void handleFind()}
                >
                  {actionLoadingKey === "find" ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <SearchIcon className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-[18px] bg-secondary/85 p-2">
            <div className="rounded-[14px] bg-transparent px-3 py-3">
              <div className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Install
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={installSpec}
                  onChange={(event) => setInstallSpec(event.target.value)}
                  placeholder="例如 owner/repo@playwright"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  className="sm:min-w-24"
                  disabled={!hasAgent || actionLoadingKey === "install" || actionLoadingKey === "find"}
                  onClick={() => void handleInstall()}
                >
                  {actionLoadingKey === "install" ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <WrenchIcon className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DashboardModule>

      <DashboardModule title="Action Report">
        <div className="rounded-[18px] bg-secondary/85 p-2">
          {actionReport ? (
            <div className="rounded-[14px] bg-transparent px-3 py-3 text-sm">
              <div className="text-foreground">{actionReport.title}</div>
              <div className="mt-1 text-muted-foreground">{actionReport.message}</div>
              {actionReport.nextAction ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  {`next · ${actionReport.nextAction}`}
                </div>
              ) : null}
              {Array.isArray(actionReport.workflow) && actionReport.workflow.length > 0 ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  {`workflow · ${actionReport.workflow.join(" -> ")}`}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-[14px] bg-transparent px-3 py-6 text-sm text-muted-foreground">
              暂无动作反馈
            </div>
          )}
        </div>
      </DashboardModule>

      <Dialog open={installConfigOpen} onOpenChange={setInstallConfigOpen}>
        <DialogContent className="w-[min(92vw,520px)]">
          <DialogHeader>
            <DialogTitle>Install 配置</DialogTitle>
            <DialogDescription>
              设置 `city skill install` 的默认参数。配置会用于当前页面的 Install 操作。
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
