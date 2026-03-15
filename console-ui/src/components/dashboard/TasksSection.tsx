/**
 * Tasks 运行状态与执行历史区。
 */

import * as React from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
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
  } = props;

  const [selectedTitle, setSelectedTitle] = React.useState("");
  const [runs, setRuns] = React.useState<UiTaskRunSummary[]>([]);
  const [selectedRunTimestamp, setSelectedRunTimestamp] = React.useState("");
  const [selectedRunDetail, setSelectedRunDetail] = React.useState<UiTaskRunDetailResponse | null>(null);
  const [loadingRuns, setLoadingRuns] = React.useState(false);
  const [loadingRunDetail, setLoadingRunDetail] = React.useState(false);
  const [forceLivePolling, setForceLivePolling] = React.useState(false);

  const badgeClass = React.useCallback(
    (status?: string): string => {
      const tone = statusBadgeVariant(status);
      if (tone === "ok") return "border-border bg-muted/45 text-foreground";
      if (tone === "bad") return "border-destructive/40 bg-destructive/10 text-destructive";
      return "border-border bg-muted/35 text-muted-foreground";
    },
    [statusBadgeVariant],
  );

  const selectedTask = React.useMemo(
    () =>
      tasks.find((item) => String(item.title || "").trim() === selectedTitle) ||
      null,
    [selectedTitle, tasks],
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
    if (!selectedTitle) {
      const fallback = String(tasks[0]?.title || "").trim();
      if (fallback) setSelectedTitle(fallback);
      return;
    }
    const exists = tasks.some(
      (item) => String(item.title || "").trim() === selectedTitle,
    );
    if (!exists) {
      const fallback = String(tasks[0]?.title || "").trim();
      setSelectedTitle(fallback || "");
    }
  }, [selectedTitle, tasks]);

  React.useEffect(() => {
    const title = String(selectedTitle || "").trim();
    if (!title) {
      setRuns([]);
      setSelectedRunTimestamp("");
      setSelectedRunDetail(null);
      setForceLivePolling(false);
      return;
    }
    void loadRuns(title, {
      showLoading: true,
      preferInProgress: true,
    });
  }, [loadRuns, selectedTitle]);

  React.useEffect(() => {
    const title = String(selectedTitle || "").trim();
    const timestamp = String(selectedRunTimestamp || "").trim();
    if (!title || !timestamp) {
      setSelectedRunDetail(null);
      return;
    }
    void loadRunDetail(title, timestamp, { showLoading: true });
  }, [loadRunDetail, selectedRunTimestamp, selectedTitle]);

  React.useEffect(() => {
    if (!activeRun?.timestamp) return;
    if (activeRun.timestamp === selectedRunTimestamp) return;
    setSelectedRunTimestamp(activeRun.timestamp);
  }, [activeRun, selectedRunTimestamp]);

  React.useEffect(() => {
    const title = String(selectedTitle || "").trim();
    if (!title) return;
    const shouldPoll =
      forceLivePolling || selectedRunInProgress || runs.some((item) => Boolean(item.inProgress));
    if (!shouldPoll) return;

    // 关键点（中文）：仅在“执行中”阶段高频轮询，完成后自动停掉，避免 UI 无意义刷接口。
    const timer = window.setInterval(() => {
      void loadRuns(title, { showLoading: false, preferInProgress: true }).then((nextRuns) => {
        const running = nextRuns.find((item) => Boolean(item.inProgress));
        const targetTimestamp = String(
          running?.timestamp ||
            selectedRunTimestamp ||
            nextRuns[0]?.timestamp ||
            "",
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
    selectedTitle,
  ]);

  return (
    <div className="space-y-4">
      <Card className="border-border/80 bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle>Tasks Runtime</CardTitle>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              暂无 task 数据
            </div>
          ) : (
            <div className="overflow-auto rounded-xl border border-border/70 bg-background/75">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Context</TableHead>
                    <TableHead>Last Run</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => {
                    const title = String(task.title || "-");
                    const status = String(task.status || "unknown");
                    const isSelected = title === selectedTitle;
                    const selectedTaskRunning = isSelected && Boolean(activeRun);
                    return (
                      <TableRow key={title} className={isSelected ? "bg-primary/5" : ""}>
                        <TableCell className="font-medium">{title}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={badgeClass(status)}>
                              {status}
                            </Badge>
                            {selectedTaskRunning ? (
                              <Badge variant="outline" className={badgeClass("running")}>
                                running
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-muted-foreground">
                            <div>{`when ${String(task.when || "-")}`}</div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[14rem] truncate font-mono text-xs" title={task.contextId || ""}>
                          {String(task.contextId || "-")}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatRunTimestampForDisplay(
                            String(task.lastRunTimestamp || ""),
                            formatTime,
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => setSelectedTitle(title)}>
                              详情
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedTitle(title);
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
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedTask ? (
        <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <Card className="border-border/80 bg-card/90 shadow-sm">
            <CardHeader>
              <CardTitle>{`Task Detail · ${selectedTitle}`}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="rounded-lg border border-border/70 bg-muted/35 px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">description</div>
                <div className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  {selectedTask.description || "-"}
                </div>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/35 px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">body</div>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/60 bg-background/80 p-2 text-[11px] leading-relaxed">
                  {selectedTask.body || "-"}
                </pre>
              </div>
              <div className="grid gap-2 rounded-lg border border-border/70 bg-muted/35 px-3 py-2 text-xs">
                <div>{`status: ${selectedTask.status || "-"}`}</div>
                <div>{`kind: ${selectedTask.kind || "-"}`}</div>
                <div>{`when: ${selectedTask.when || "-"}`}</div>
                <div className="truncate font-mono" title={selectedTask.contextId || ""}>{`contextId: ${selectedTask.contextId || "-"}`}</div>
                <div className="truncate font-mono" title={selectedTask.taskMdPath || ""}>{`taskMdPath: ${selectedTask.taskMdPath || "-"}`}</div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {activeRun || selectedRunInProgress || forceLivePolling ? (
              <Card className="border-border/80 bg-card/90 shadow-sm">
                <CardHeader>
                  <CardTitle>Current Execution</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="grid gap-2 rounded-lg border border-border/70 bg-muted/35 p-3">
                    <div>{`time: ${formatRunTimestampForDisplay(
                      String(activeRun?.timestamp || selectedRunTimestamp || ""),
                      formatTime,
                    )}`}</div>
                    <div className="flex items-center gap-2">
                      <span>status:</span>
                      <Badge
                        variant="outline"
                        className={badgeClass(normalizeRunStatus(activeRun || selectedRun, selectedRunDetail))}
                      >
                        {normalizeRunStatus(activeRun || selectedRun, selectedRunDetail)}
                      </Badge>
                    </div>
                    <div>{`phase: ${String(selectedRunDetail?.progress?.phase || activeRun?.progressPhase || "-")}`}</div>
                    <div>{`message: ${String(selectedRunDetail?.progress?.message || activeRun?.progressMessage || "-")}`}</div>
                    <div>{`round: ${
                      selectedRunDetail?.progress?.round ?? activeRun?.progressRound ?? "-"
                    }/${selectedRunDetail?.progress?.maxRounds ?? activeRun?.progressMaxRounds ?? "-"}`}</div>
                    <div>{`updatedAt: ${formatTime(selectedRunDetail?.progress?.updatedAt || activeRun?.progressUpdatedAt)}`}</div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Progress Events</div>
                    <div className="max-h-48 space-y-2 overflow-auto rounded-lg border border-border/70 bg-background/75 p-2">
                      {Array.isArray(selectedRunDetail?.progress?.events) &&
                      selectedRunDetail.progress.events.length > 0 ? (
                        selectedRunDetail.progress.events.slice(-12).map((event, index) => (
                          <article key={`${String(event.at || index)}:${index}`} className="rounded-md border border-border/70 bg-card p-2">
                            <div className="mb-1 text-[11px] text-muted-foreground">
                              {`${String(event.phase || "phase")} · ${formatTime(event.at)}`}
                            </div>
                            <div className="text-xs">{String(event.message || "-")}</div>
                          </article>
                        ))
                      ) : (
                        <div className="text-xs text-muted-foreground">等待执行进度...</div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card className="border-border/80 bg-card/90 shadow-sm">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Run History</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void loadRuns(selectedTitle, {
                      showLoading: true,
                      preferInProgress: true,
                    });
                  }}
                  disabled={loadingRuns}
                >
                  {loadingRuns ? "加载中..." : "刷新"}
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto rounded-xl border border-border/70 bg-background/75">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Started</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Rounds</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-sm text-muted-foreground">
                            暂无执行记录
                          </TableCell>
                        </TableRow>
                      ) : (
                        runs.map((run) => {
                          const isActive = run.timestamp === selectedRunTimestamp;
                          const status = run.inProgress
                            ? "running"
                            : String(run.status || run.executionStatus || "unknown");
                          return (
                            <TableRow key={run.timestamp} className={isActive ? "bg-primary/5" : ""}>
                              <TableCell className="text-xs text-muted-foreground">
                                {formatRunTimestampForDisplay(run.timestamp, formatTime)}
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <Badge variant="outline" className={badgeClass(status)}>
                                    {status}
                                  </Badge>
                                  {run.inProgress && run.progressMessage ? (
                                    <div className="max-w-[20rem] truncate text-[11px] text-muted-foreground" title={run.progressMessage}>
                                      {run.progressMessage}
                                    </div>
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{formatTime(run.startedAt)}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {formatDurationMs(run.startedAt, run.endedAt)}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {run.dialogueRounds ?? run.progressRound ?? "-"}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant={isActive ? "secondary" : "outline"}
                                  onClick={() => setSelectedRunTimestamp(run.timestamp)}
                                >
                                  查看
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/80 bg-card/90 shadow-sm">
              <CardHeader>
                <CardTitle>{`Run Detail${
                  selectedRunTimestamp
                    ? ` · ${formatRunTimestampForDisplay(selectedRunTimestamp, formatTime)}`
                    : ""
                }`}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {loadingRunDetail ? (
                  <div className="text-sm text-muted-foreground">加载中...</div>
                ) : !selectedRunDetail ? (
                  <div className="text-sm text-muted-foreground">请选择一条 run 记录</div>
                ) : (
                  <>
                    <div className="grid gap-2 rounded-lg border border-border/70 bg-muted/35 p-3 text-xs">
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
                          <pre className="max-h-56 overflow-auto rounded-lg border border-border/70 bg-background/75 p-2 text-[11px] leading-relaxed">
                            {String(selectedRunDetail.artifacts?.[key] || "-")}
                          </pre>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timeline (Live)</div>
                      <div className="max-h-72 space-y-2 overflow-auto rounded-lg border border-border/70 bg-background/75 p-2">
                        {(selectedRunDetail.messages || []).length === 0 ? (
                          <div className="text-xs text-muted-foreground">无 timeline 消息</div>
                        ) : (
                          (selectedRunDetail.messages || []).map((msg, index) => (
                            <article key={`${msg.id || index}`} className="rounded-md border border-border/70 bg-card p-2">
                              <div className="mb-1 text-[11px] text-muted-foreground">
                                {`${String(msg.role || "unknown")} · ${formatTime(msg.ts)}`}
                              </div>
                              <div className="whitespace-pre-wrap break-all text-xs">{String(msg.text || "")}</div>
                            </article>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
