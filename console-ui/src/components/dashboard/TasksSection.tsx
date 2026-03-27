/**
 * Tasks 运行状态与执行历史区。
 *
 * 关键点（中文）
 * - `/tasks`：只展示 task 总览列表（名称 + 状态）。
 * - `/tasks/:title`：只展示当前 task 的详细内容，不再重复展示 task 列表。
 */

import * as React from "react";
import { EllipsisIcon, Trash2Icon } from "lucide-react";
import { dashboardDangerIconButtonClass, dashboardIconButtonClass } from "./dashboard-action-button";
import { Badge, Button } from "@downcity/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@downcity/ui";
import { DashboardModule } from "./DashboardModule";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";
import { useConfirmDialog } from "../ui/confirm-dialog";
import type {
  UiTaskItem,
  UiTaskStatusValue,
  UiTaskRunDetailResponse,
  UiTaskRunSummary,
} from "../../types/Dashboard";

export interface TasksSectionProps {
  /**
   * task 列表。
   */
  tasks: UiTaskItem[];
  /**
   * 状态 -> 徽标变体映射。
   */
  statusBadgeVariant: (status?: string) => "ok" | "warn" | "bad";
  /**
   * 时间格式化。
   */
  formatTime: (ts?: number | string) => string;
  /**
   * 手动执行任务。
   */
  onRunTask: (title: string) => void;
  /**
   * 设置任务状态。
   */
  onSetTaskStatus: (title: string, status: UiTaskStatusValue) => Promise<boolean>;
  /**
   * 删除任务定义。
   */
  onDeleteTask: (title: string) => Promise<boolean>;
  /**
   * 加载任务执行列表。
   */
  onLoadTaskRuns: (title: string, limit?: number) => Promise<UiTaskRunSummary[]>;
  /**
   * 删除单条 run 记录。
   */
  onDeleteTaskRun: (title: string, timestamp: string) => Promise<boolean>;
  /**
   * 一键清理当前 task 的全部 run 记录。
   */
  onClearTaskRuns: (title: string) => Promise<boolean>;
  /**
   * 加载任务执行详情。
   */
  onLoadTaskRunDetail: (title: string, timestamp: string) => Promise<UiTaskRunDetailResponse | null>;
  /**
   * 外部路由驱动的已选 task 标题。
   */
  selectedTaskTitle?: string;
  /**
   * 当内部切换 task 时同步到外部路由。
   */
  onSelectTaskTitle?: (title: string) => void;
}

function formatDurationMs(startedAt?: number, endedAt?: number): string {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return "-";
  const diff = Math.max(0, Number(endedAt) - Number(startedAt));
  if (diff < 1000) return `${diff} ms`;
  return `${(diff / 1000).toFixed(2)} s`;
}

function formatRunTimestampForDisplay(
  raw: string | undefined,
  formatTime: (ts?: number | string) => string,
): string {
  const value = String(raw || "").trim();
  if (!value) return "-";

  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(\d{3})$/,
  );
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    const milli = Number(match[7]);
    const t = new Date(year, month, day, hour, minute, second, milli).getTime();
    const human = formatTime(t);
    return human === "-" ? "未记录时间" : human;
  }

  const parsed = formatTime(value);
  return parsed === "-" ? "未记录时间" : parsed;
}

function normalizeRunStatus(
  run?: UiTaskRunSummary | null,
  detail?: UiTaskRunDetailResponse | null,
): string {
  const progressStatus = String(detail?.progress?.status || "").trim();
  if (progressStatus) return progressStatus;
  if (run?.inProgress) return "running";
  return String(run?.status || run?.executionStatus || "unknown");
}

function formatWhenLabel(rawWhen?: string): string {
  const value = String(rawWhen || "").trim();
  if (!value) return "manual";
  if (value === "@manual") return "manual";
  if (value.startsWith("time:")) return value.slice(5) || "time";
  return value;
}

export function TasksSection(props: TasksSectionProps) {
  const {
    tasks,
    statusBadgeVariant,
    formatTime,
    onRunTask,
    onSetTaskStatus,
    onDeleteTask,
    onLoadTaskRuns,
    onDeleteTaskRun,
    onClearTaskRuns,
    onLoadTaskRunDetail,
    selectedTaskTitle,
    onSelectTaskTitle,
  } = props;
  const confirm = useConfirmDialog();

  const routeTaskTitle = String(selectedTaskTitle || "").trim();
  const selectedTask = React.useMemo(
    () => tasks.find((item) => String(item.title || "").trim() === routeTaskTitle) || null,
    [routeTaskTitle, tasks],
  );
  const isOverviewMode = !routeTaskTitle;

  const [runs, setRuns] = React.useState<UiTaskRunSummary[]>([]);
  const [selectedRunTimestamp, setSelectedRunTimestamp] = React.useState("");
  const [selectedRunDetail, setSelectedRunDetail] = React.useState<UiTaskRunDetailResponse | null>(null);
  const [loadingRuns, setLoadingRuns] = React.useState(false);
  const [loadingRunDetail, setLoadingRunDetail] = React.useState(false);
  const [forceLivePolling, setForceLivePolling] = React.useState(false);
  const [runDetailOpen, setRunDetailOpen] = React.useState(false);
  const [taskMutating, setTaskMutating] = React.useState(false);
  const [deletingRunTimestamp, setDeletingRunTimestamp] = React.useState("");
  const [clearingAllRuns, setClearingAllRuns] = React.useState(false);

  const badgeClass = React.useCallback(
    (status?: string): string => {
      const tone = statusBadgeVariant(status);
      if (tone === "ok") return "bg-secondary text-foreground";
      if (tone === "bad") return "border-destructive/40 bg-destructive/10 text-destructive";
      return "bg-card text-muted-foreground";
    },
    [statusBadgeVariant],
  );

  const selectedRun = React.useMemo(
    () =>
      runs.find((item) => String(item.timestamp || "").trim() === selectedRunTimestamp) || null,
    [runs, selectedRunTimestamp],
  );

  const activeRun = React.useMemo(
    () => runs.find((item) => Boolean(item.inProgress)) || null,
    [runs],
  );

  const selectedRunInProgress = React.useMemo(
    () =>
      Boolean(selectedRun?.inProgress) ||
      String(selectedRunDetail?.progress?.status || "").trim().toLowerCase() === "running",
    [selectedRun, selectedRunDetail],
  );

  const overviewStats = React.useMemo(() => {
    const total = tasks.length;
    const running = tasks.filter((item) => String(item.status || "").toLowerCase() === "running").length;
    const failed = tasks.filter((item) => {
      const status = String(item.status || "").toLowerCase();
      return status === "error" || status === "failed" || status === "failure";
    }).length;
    const manual = tasks.filter((item) => String(item.when || "").trim() === "@manual").length;
    return { total, running, failed, manual };
  }, [tasks]);

  const loadRuns = React.useCallback(
    async (
      titleInput: string,
      options?: {
        showLoading?: boolean;
        preferInProgress?: boolean;
      },
    ): Promise<UiTaskRunSummary[]> => {
      const title = String(titleInput || "").trim();
      if (!title) return [];
      const showLoading = options?.showLoading !== false;
      if (showLoading) setLoadingRuns(true);
      try {
        const nextRuns = await onLoadTaskRuns(title, 50);
        setRuns(nextRuns);
        setSelectedRunTimestamp((prev) => {
          const running = options?.preferInProgress
            ? nextRuns.find((item) => Boolean(item.inProgress))
            : null;
          if (running?.timestamp) return String(running.timestamp);
          if (prev && nextRuns.some((item) => item.timestamp === prev)) return prev;
          return String(nextRuns[0]?.timestamp || "").trim();
        });
        return nextRuns;
      } finally {
        if (showLoading) setLoadingRuns(false);
      }
    },
    [onLoadTaskRuns],
  );

  const loadRunDetail = React.useCallback(
    async (
      titleInput: string,
      timestampInput: string,
      options?: {
        showLoading?: boolean;
      },
    ): Promise<UiTaskRunDetailResponse | null> => {
      const title = String(titleInput || "").trim();
      const timestamp = String(timestampInput || "").trim();
      if (!title || !timestamp) {
        setSelectedRunDetail(null);
        return null;
      }
      const showLoading = options?.showLoading !== false;
      if (showLoading) setLoadingRunDetail(true);
      try {
        const detail = await onLoadTaskRunDetail(title, timestamp);
        setSelectedRunDetail(detail);
        return detail;
      } finally {
        if (showLoading) setLoadingRunDetail(false);
      }
    },
    [onLoadTaskRunDetail],
  );

  React.useEffect(() => {
    if (!selectedTask) {
      setRuns([]);
      setSelectedRunTimestamp("");
      setSelectedRunDetail(null);
      setForceLivePolling(false);
      setRunDetailOpen(false);
      return;
    }
    void loadRuns(String(selectedTask.title || ""), {
      showLoading: true,
      preferInProgress: true,
    });
  }, [loadRuns, selectedTask]);

  React.useEffect(() => {
    const title = String(selectedTask?.title || "").trim();
    const timestamp = String(selectedRunTimestamp || "").trim();
    if (!title || !timestamp) {
      setSelectedRunDetail(null);
      return;
    }
    void loadRunDetail(title, timestamp, { showLoading: true });
  }, [loadRunDetail, selectedRunTimestamp, selectedTask]);

  React.useEffect(() => {
    if (!activeRun?.timestamp) return;
    if (activeRun.timestamp === selectedRunTimestamp) return;
    setSelectedRunTimestamp(activeRun.timestamp);
  }, [activeRun, selectedRunTimestamp]);

  React.useEffect(() => {
    const title = String(selectedTask?.title || "").trim();
    if (!title) return;
    const shouldPoll =
      forceLivePolling || selectedRunInProgress || runs.some((item) => Boolean(item.inProgress));
    if (!shouldPoll) return;

    // 关键点（中文）：仅在执行中轮询，执行结束自动停掉，减少无效刷新。
    const timer = window.setInterval(() => {
      void loadRuns(title, { showLoading: false, preferInProgress: true }).then((nextRuns) => {
        const running = nextRuns.find((item) => Boolean(item.inProgress));
        const targetTimestamp = String(
          running?.timestamp || selectedRunTimestamp || nextRuns[0]?.timestamp || "",
        ).trim();
        if (targetTimestamp) {
          void loadRunDetail(title, targetTimestamp, { showLoading: false });
        }
        if (!running) {
          setForceLivePolling(false);
        }
      });
    }, 1500);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    forceLivePolling,
    loadRunDetail,
    loadRuns,
    runs,
    selectedRunInProgress,
    selectedRunTimestamp,
    selectedTask,
  ]);

  if (isOverviewMode) {
    return (
      <DashboardModule
        title="Tasks"
        description="任务定义、状态与最近执行时间总览。"
        actions={
          <>
            <Badge variant="outline" className="bg-secondary text-foreground">{`total ${overviewStats.total}`}</Badge>
            <Badge variant="outline" className="border-border/60 bg-primary/10 text-primary">{`running ${overviewStats.running}`}</Badge>
            <Badge variant="outline" className="border-border/60 bg-destructive/10 text-destructive">{`failed ${overviewStats.failed}`}</Badge>
            <Badge variant="outline" className="bg-secondary text-foreground">{`manual ${overviewStats.manual}`}</Badge>
          </>
        }
      >
        {tasks.length === 0 ? (
          <div className="rounded-[20px] bg-secondary px-4 py-6 text-sm text-muted-foreground">暂无 task 数据</div>
        ) : (
          <div className="space-y-1.5">
            {tasks.map((task) => {
              const title = String(task.title || "").trim();
              if (!title) return null;
              const status = String(task.status || "unknown");
              const description = String(task.description || "").trim();
              const whenLabel = formatWhenLabel(task.when);
              return (
                <button
                  key={title}
                  type="button"
                  className="flex w-full items-start justify-between gap-3 rounded-[18px] bg-transparent px-3 py-2.5 text-left transition-colors hover:bg-secondary"
                  onClick={() => onSelectTaskTitle?.(title)}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="truncate text-sm font-medium text-foreground">{title}</div>
                    <div className="truncate text-xs text-muted-foreground">{description || "无描述"}</div>
                  </div>
                  <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1.5">
                    <Badge variant="outline" className={badgeClass(status)}>{status}</Badge>
                    <Badge variant="outline" className="bg-secondary text-muted-foreground">{whenLabel}</Badge>
                    <Badge variant="outline" className="bg-background text-muted-foreground">
                      {formatRunTimestampForDisplay(String(task.lastRunTimestamp || ""), formatTime)}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </DashboardModule>
    );
  }

  if (!selectedTask) {
    return <div className="py-6 text-sm text-muted-foreground">该 task 不存在或已被删除</div>;
  }

  const selectedTaskTitleValue = String(selectedTask.title || "").trim();
  const selectedTaskStatus = String(selectedTask.status || "").trim().toLowerCase();
  const toggleTargetStatus: UiTaskStatusValue =
    selectedTaskStatus === "enabled" ? "paused" : "enabled";
  const toggleActionLabel = toggleTargetStatus === "enabled" ? "恢复调度" : "暂停调度";
  const statusHint =
    selectedTaskStatus === "paused"
      ? "paused：保留定义，不参与调度，可随时恢复。"
      : selectedTaskStatus === "disabled"
        ? "disabled：显式禁用，仍保留定义，但当前作为关闭态处理。"
        : "enabled：参与调度，按 when 正常运行。";

  const handleDeleteTask = React.useCallback(async () => {
    if (!selectedTaskTitleValue) return;
    const shouldDelete = await confirm({
      title: "删除任务",
      description: `确认删除任务「${selectedTaskTitleValue}」及其全部运行记录？`,
      confirmText: "删除",
      cancelText: "取消",
      confirmVariant: "destructive",
    });
    if (!shouldDelete) return;
    setTaskMutating(true);
    try {
      const deleted = await onDeleteTask(selectedTaskTitleValue);
      if (deleted) {
        onSelectTaskTitle?.("");
      }
    } finally {
      setTaskMutating(false);
    }
  }, [confirm, onDeleteTask, onSelectTaskTitle, selectedTaskTitleValue]);

  const handleDisableTask = React.useCallback(async () => {
    if (!selectedTaskTitleValue) return;
    setTaskMutating(true);
    try {
      await onSetTaskStatus(selectedTaskTitleValue, "disabled");
    } finally {
      setTaskMutating(false);
    }
  }, [onSetTaskStatus, selectedTaskTitleValue]);

  const handleToggleTaskStatus = React.useCallback(async () => {
    if (!selectedTaskTitleValue) return;
    setTaskMutating(true);
    try {
      await onSetTaskStatus(selectedTaskTitleValue, toggleTargetStatus);
    } finally {
      setTaskMutating(false);
    }
  }, [onSetTaskStatus, selectedTaskTitleValue, toggleTargetStatus]);

  return (
    <div className="space-y-4">
      <DashboardModule
        title="Task Runtime"
        description={String(selectedTask.description || "").trim() || "无描述"}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  className={dashboardIconButtonClass}
                  disabled={taskMutating || !selectedTaskTitleValue}
                  aria-label="任务操作"
                  title="任务操作"
                />
              }
            >
              <EllipsisIcon className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[14rem]">
              <DropdownMenuGroup>
                <DropdownMenuLabel>任务操作</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => void handleToggleTaskStatus()}>
                  {toggleActionLabel}
                </DropdownMenuItem>
                {selectedTaskStatus !== "disabled" ? (
                  <DropdownMenuItem onClick={() => void handleDisableTask()}>
                    设为 disabled
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => void handleDeleteTask()}>
                删除任务
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={badgeClass(String(selectedTask.status || "unknown"))}>
            {String(selectedTask.status || "unknown")}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => onSelectTaskTitle?.("")}>
            返回列表
          </Button>
          <Button
            size="sm"
            onClick={() => {
              const title = String(selectedTask.title || "").trim();
              if (!title) return;
              setForceLivePolling(true);
              onRunTask(title);
              window.setTimeout(() => {
                void loadRuns(title, {
                  showLoading: false,
                  preferInProgress: true,
                });
              }, 350);
            }}
          >
            Run Task
          </Button>
        </div>
        <div className="text-lg font-semibold tracking-tight text-foreground">
          {String(selectedTask.title || "-")}
        </div>
        <div className="text-xs text-muted-foreground">{statusHint}</div>
      </DashboardModule>

      <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
        <DashboardModule title="Definition" description="任务定义、触发方式与原始内容。">
          <div className="rounded-[20px] bg-secondary px-4 py-3.5">
            <div className="grid gap-1.5 text-xs text-muted-foreground">
            <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-2">
              <span className="text-foreground/80">kind</span>
              <span>{selectedTask.kind || "-"}</span>
            </div>
            <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-2">
              <span className="text-foreground/80">when</span>
              <span>{formatWhenLabel(selectedTask.when)}</span>
            </div>
            <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-2">
              <span className="text-foreground/80">session</span>
              <span className="truncate font-mono" title={selectedTask.sessionId || ""}>{selectedTask.sessionId || "-"}</span>
            </div>
            <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-2">
              <span className="text-foreground/80">file</span>
              <span className="truncate font-mono" title={selectedTask.taskMdPath || ""}>{selectedTask.taskMdPath || "-"}</span>
            </div>
            <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-2">
              <span className="text-foreground/80">lastRun</span>
              <span>{formatRunTimestampForDisplay(String(selectedTask.lastRunTimestamp || ""), formatTime)}</span>
            </div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Body</div>
            <pre className="h-[46vh] min-h-[20rem] overflow-auto rounded-[20px] bg-secondary px-4 py-3.5 text-[12px] leading-relaxed text-foreground/90">
              {selectedTask.body || "-"}
            </pre>
          </div>
        </DashboardModule>

        <DashboardModule
          title="Runtime"
          description="最近执行记录、状态与运行详情。"
          bodyClassName="min-h-0"
          actions={
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const taskTitle = String(selectedTask.title || "").trim();
                  if (!taskTitle) return;
                  const shouldClear = await confirm({
                    title: "清空 Run Log",
                    description: `确认清理任务「${taskTitle}」的全部 run 记录？`,
                    confirmText: "清空",
                    cancelText: "取消",
                    confirmVariant: "destructive",
                  });
                  if (!shouldClear) return;
                  setClearingAllRuns(true);
                  try {
                    const cleared = await onClearTaskRuns(taskTitle);
                    if (!cleared) return;
                    const nextRuns = await loadRuns(taskTitle, {
                      showLoading: false,
                      preferInProgress: true,
                    });
                    const nextTimestamp = String(nextRuns[0]?.timestamp || "").trim();
                    if (!nextTimestamp) {
                      setSelectedRunTimestamp("");
                      setSelectedRunDetail(null);
                      setRunDetailOpen(false);
                    }
                  } finally {
                    setClearingAllRuns(false);
                  }
                }}
                disabled={loadingRuns || clearingAllRuns}
              >
                {clearingAllRuns ? "清理中..." : "清空 Run Log"}
              </Button>
            </div>
          }
        >

          {runs.length === 0 ? (
            <div className="rounded-[18px] bg-secondary px-4 py-5 text-sm text-muted-foreground">暂无执行记录</div>
          ) : (
            <div className="max-h-[62vh] space-y-1.5 overflow-y-auto pr-1">
              {runs.map((run) => {
                const status = run.inProgress
                  ? "running"
                  : String(run.status || run.executionStatus || "unknown");
                const isActive = String(run.timestamp || "") === String(selectedRunTimestamp || "");
                const runTimestamp = String(run.timestamp || "").trim();
                const deletingThisRun = deletingRunTimestamp === runTimestamp;
                return (
                  <div key={run.timestamp} className="flex items-start gap-1.5">
                    <button
                      type="button"
                      className={cn(
                        "min-w-0 flex-1 rounded-[18px] px-3.5 py-3 text-left transition-colors",
                        isActive ? "bg-secondary" : "bg-transparent hover:bg-secondary",
                      )}
                      onClick={() => {
                        setSelectedRunTimestamp(run.timestamp);
                        setRunDetailOpen(true);
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-medium text-foreground/90">
                          {formatRunTimestampForDisplay(run.timestamp, formatTime)}
                        </div>
                        <Badge variant="outline" className={badgeClass(status)}>{status}</Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                        <span>{`start ${formatTime(run.startedAt)}`}</span>
                        <span>{`duration ${formatDurationMs(run.startedAt, run.endedAt)}`}</span>
                        <span>{`rounds ${run.dialogueRounds ?? run.progressRound ?? "-"}`}</span>
                      </div>
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className={`mt-1 ${dashboardDangerIconButtonClass}`}
                      disabled={Boolean(run.inProgress) || deletingThisRun}
                      onClick={async () => {
                        if (!selectedTaskTitleValue || !runTimestamp) return;
                        const shouldDelete = await confirm({
                          title: "删除 Run 记录",
                          description: `确认删除 run「${runTimestamp}」记录？`,
                          confirmText: "删除",
                          cancelText: "取消",
                          confirmVariant: "destructive",
                        });
                        if (!shouldDelete) return;
                        setDeletingRunTimestamp(runTimestamp);
                        try {
                          const deleted = await onDeleteTaskRun(selectedTaskTitleValue, runTimestamp);
                          if (!deleted) return;
                          const nextRuns = await loadRuns(selectedTaskTitleValue, {
                            showLoading: false,
                            preferInProgress: true,
                          });
                          if (!nextRuns.some((item) => String(item.timestamp || "").trim() === runTimestamp)) {
                            if (String(selectedRunTimestamp || "").trim() === runTimestamp) {
                              const nextTimestamp = String(nextRuns[0]?.timestamp || "").trim();
                              setSelectedRunTimestamp(nextTimestamp);
                              if (!nextTimestamp) {
                                setSelectedRunDetail(null);
                                setRunDetailOpen(false);
                              }
                            }
                          }
                        } finally {
                          setDeletingRunTimestamp("");
                        }
                      }}
                      title="删除 run"
                      aria-label="删除 run"
                    >
                      {deletingThisRun ? <Trash2Icon className="size-3.5 animate-pulse" /> : <Trash2Icon className="size-3.5" />}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </DashboardModule>
      </div>

      <Dialog open={runDetailOpen} onOpenChange={setRunDetailOpen}>
        <DialogContent className="w-[min(96vw,980px)] p-0">
          <DialogHeader className="bg-secondary px-4 py-4">
            <DialogTitle>
              {`Run Detail${
                selectedRunTimestamp
                  ? ` · ${formatRunTimestampForDisplay(selectedRunTimestamp, formatTime)}`
                  : ""
              }`}
            </DialogTitle>
            <DialogDescription>{selectedTask?.title || "-"}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[68vh] space-y-3 overflow-y-auto px-4 py-4">
            {loadingRunDetail ? (
              <div className="text-sm text-muted-foreground">加载中...</div>
            ) : !selectedRunDetail ? (
              <div className="text-sm text-muted-foreground">未找到执行详情</div>
            ) : (
              <>
                <div className="rounded-[18px] bg-secondary px-3.5 py-3 text-xs text-muted-foreground">
                  <div>{`runDir: ${selectedRunDetail.runDirRel || "-"}`}</div>
                  <div>{`status: ${normalizeRunStatus(selectedRun, selectedRunDetail)}`}</div>
                  <div>{`phase: ${String(selectedRunDetail.progress?.phase || "-")}`}</div>
                  <div>{`message: ${String(selectedRunDetail.progress?.message || "-")}`}</div>
                  <div>{`updatedAt: ${formatTime(selectedRunDetail.progress?.updatedAt)}`}</div>
                  <div>{`error: ${String(selectedRunDetail.meta?.error || "-")}`}</div>
                </div>

                <div className="grid gap-3 xl:grid-cols-2">
                  {(["input", "output", "result", "dialogue", "error"] as const).map((key) => (
                    <div key={key} className="space-y-1">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{key}</div>
                      <pre className="max-h-56 overflow-auto rounded-[16px] bg-card px-3 py-2.5 text-[11px] leading-relaxed">
                        {String(selectedRunDetail.artifacts?.[key] || "-")}
                      </pre>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
