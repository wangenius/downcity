/**
 * Tasks 运行状态与执行历史区。
 *
 * 关键点（中文）
 * - `/tasks`：只展示 task 总览列表（名称 + 状态）。
 * - `/tasks/:title`：只展示当前 task 的详细内容，不再重复展示 task 列表。
 */

import * as React from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import type {
  UiTaskItem,
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
   * 加载任务执行列表。
   */
  onLoadTaskRuns: (title: string, limit?: number) => Promise<UiTaskRunSummary[]>;
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

export function TasksSection(props: TasksSectionProps) {
  const {
    tasks,
    statusBadgeVariant,
    formatTime,
    onRunTask,
    onLoadTaskRuns,
    onLoadTaskRunDetail,
    selectedTaskTitle,
    onSelectTaskTitle,
  } = props;

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

  const badgeClass = React.useCallback(
    (status?: string): string => {
      const tone = statusBadgeVariant(status);
      if (tone === "ok") return "border-border bg-muted/45 text-foreground";
      if (tone === "bad") return "border-destructive/40 bg-destructive/10 text-destructive";
      return "border-border bg-muted/35 text-muted-foreground";
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
      <div className="space-y-2">
        <div className="border-b border-border/70 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Tasks
        </div>

        {tasks.length === 0 ? (
          <div className="py-4 text-sm text-muted-foreground">暂无 task 数据</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-0 py-2 font-medium">Task</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => {
                  const title = String(task.title || "").trim();
                  if (!title) return null;
                  const status = String(task.status || "unknown");
                  return (
                    <tr
                      key={title}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => onSelectTaskTitle?.(title)}
                    >
                      <td className="px-0 py-2 text-sm font-medium">{title}</td>
                      <td className="px-2 py-2">
                        <Badge variant="outline" className={badgeClass(status)}>
                          {status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  if (!selectedTask) {
    return <div className="py-6 text-sm text-muted-foreground">该 task 不存在或已被删除</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-border/70 pb-2">
        <div className="text-sm font-semibold tracking-tight">{String(selectedTask.title || "-")}</div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={badgeClass(String(selectedTask.status || "unknown"))}>
            {String(selectedTask.status || "unknown")}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => onSelectTaskTitle?.("")}>
            返回列表
          </Button>
          <Button
            size="sm"
            variant="outline"
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
            run
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="min-w-0 space-y-2">
          <div className="border-b border-border/70 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Task Detail
          </div>
          <div className="space-y-2 text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">description</div>
            <div className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{selectedTask.description || "-"}</div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">body</div>
            <pre className="h-[42vh] min-h-[22rem] overflow-auto border border-border/70 bg-background p-3 text-[12px] leading-relaxed">
              {selectedTask.body || "-"}
            </pre>
            <div className="space-y-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                <span className="text-foreground/80">kind</span>
                <span>{selectedTask.kind || "-"}</span>
              </div>
              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                <span className="text-foreground/80">when</span>
                <span>{selectedTask.when || "-"}</span>
              </div>
              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                <span className="text-foreground/80">contextId</span>
                <span className="truncate font-mono" title={selectedTask.contextId || ""}>{selectedTask.contextId || "-"}</span>
              </div>
              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                <span className="text-foreground/80">taskMdPath</span>
                <span className="truncate font-mono" title={selectedTask.taskMdPath || ""}>{selectedTask.taskMdPath || "-"}</span>
              </div>
              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                <span className="text-foreground/80">lastRun</span>
                <span>{formatRunTimestampForDisplay(String(selectedTask.lastRunTimestamp || ""), formatTime)}</span>
              </div>
            </div>
          </div>
        </section>

        <div className="space-y-2">
          <section className="space-y-2">
            <div className="flex items-center justify-between border-b border-border/70 pb-2">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Runtime</div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void loadRuns(String(selectedTask.title || ""), {
                    showLoading: true,
                    preferInProgress: true,
                  });
                }}
                disabled={loadingRuns}
              >
                {loadingRuns ? "加载中..." : "刷新"}
              </Button>
            </div>

            <div className="overflow-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    <th className="px-0 py-2 font-medium">Time</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Started</th>
                    <th className="px-2 py-2 font-medium">Duration</th>
                    <th className="px-2 py-2 font-medium">Rounds</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-0 py-3 text-sm text-muted-foreground">
                        暂无执行记录
                      </td>
                    </tr>
                  ) : (
                    runs.map((run) => {
                      const status = run.inProgress
                        ? "running"
                        : String(run.status || run.executionStatus || "unknown");
                      return (
                        <tr
                          key={run.timestamp}
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => {
                            setSelectedRunTimestamp(run.timestamp);
                            setRunDetailOpen(true);
                          }}
                        >
                          <td className="px-0 py-2 text-xs text-muted-foreground">
                            {formatRunTimestampForDisplay(run.timestamp, formatTime)}
                          </td>
                          <td className="px-2 py-2">
                            <Badge variant="outline" className={badgeClass(status)}>
                              {status}
                            </Badge>
                          </td>
                          <td className="px-2 py-2 text-xs text-muted-foreground">{formatTime(run.startedAt)}</td>
                          <td className="px-2 py-2 text-xs text-muted-foreground">
                            {formatDurationMs(run.startedAt, run.endedAt)}
                          </td>
                          <td className="px-2 py-2 text-xs text-muted-foreground">
                            {run.dialogueRounds ?? run.progressRound ?? "-"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      <Dialog open={runDetailOpen} onOpenChange={setRunDetailOpen}>
        <DialogContent className="w-[min(96vw,980px)]">
          <DialogHeader>
            <DialogTitle>
              {`Run Detail${
                selectedRunTimestamp
                  ? ` · ${formatRunTimestampForDisplay(selectedRunTimestamp, formatTime)}`
                  : ""
              }`}
            </DialogTitle>
            <DialogDescription>
              {selectedTask?.title || "-"}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[68vh] space-y-3 overflow-y-auto px-4 pb-4">
            {loadingRunDetail ? (
              <div className="text-sm text-muted-foreground">加载中...</div>
            ) : !selectedRunDetail ? (
              <div className="text-sm text-muted-foreground">未找到执行详情</div>
            ) : (
              <>
                <div className="grid gap-1 border-b border-border/60 pb-2 text-xs text-muted-foreground">
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
                      <pre className="max-h-56 overflow-auto border border-border/70 bg-background p-2 text-[11px] leading-relaxed">
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
