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
  onRunTask: (taskId: string) => void;
  /**
   * 加载任务执行列表。
   */
  onLoadTaskRuns: (taskId: string, limit?: number) => Promise<UiTaskRunSummary[]>;
  /**
   * 加载任务执行详情。
   */
  onLoadTaskRunDetail: (taskId: string, timestamp: string) => Promise<UiTaskRunDetailResponse | null>;
}

function formatDurationMs(startedAt?: number, endedAt?: number): string {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return "-";
  const diff = Math.max(0, Number(endedAt) - Number(startedAt));
  if (diff < 1000) return `${diff} ms`;
  return `${(diff / 1000).toFixed(2)} s`;
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

  const [selectedTaskId, setSelectedTaskId] = React.useState("");
  const [runs, setRuns] = React.useState<UiTaskRunSummary[]>([]);
  const [selectedRunTimestamp, setSelectedRunTimestamp] = React.useState("");
  const [selectedRunDetail, setSelectedRunDetail] = React.useState<UiTaskRunDetailResponse | null>(null);
  const [loadingRuns, setLoadingRuns] = React.useState(false);
  const [loadingRunDetail, setLoadingRunDetail] = React.useState(false);

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
      tasks.find((item) => String(item.taskId || item.id || "").trim() === selectedTaskId) ||
      null,
    [selectedTaskId, tasks],
  );

  React.useEffect(() => {
    if (!selectedTaskId) {
      const fallback = String(tasks[0]?.taskId || tasks[0]?.id || "").trim();
      if (fallback) setSelectedTaskId(fallback);
      return;
    }
    const exists = tasks.some(
      (item) => String(item.taskId || item.id || "").trim() === selectedTaskId,
    );
    if (!exists) {
      const fallback = String(tasks[0]?.taskId || tasks[0]?.id || "").trim();
      setSelectedTaskId(fallback || "");
    }
  }, [selectedTaskId, tasks]);

  React.useEffect(() => {
    const taskId = String(selectedTaskId || "").trim();
    if (!taskId) {
      setRuns([]);
      setSelectedRunTimestamp("");
      setSelectedRunDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingRuns(true);
    void onLoadTaskRuns(taskId, 50)
      .then((nextRuns) => {
        if (cancelled) return;
        setRuns(nextRuns);
        const fallback = String(nextRuns[0]?.timestamp || "").trim();
        setSelectedRunTimestamp((prev) => (prev && nextRuns.some((x) => x.timestamp === prev) ? prev : fallback));
      })
      .finally(() => {
        if (!cancelled) setLoadingRuns(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onLoadTaskRuns, selectedTaskId]);

  React.useEffect(() => {
    const taskId = String(selectedTaskId || "").trim();
    const timestamp = String(selectedRunTimestamp || "").trim();
    if (!taskId || !timestamp) {
      setSelectedRunDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingRunDetail(true);
    void onLoadTaskRunDetail(taskId, timestamp)
      .then((detail) => {
        if (cancelled) return;
        setSelectedRunDetail(detail);
      })
      .finally(() => {
        if (!cancelled) setLoadingRunDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onLoadTaskRunDetail, selectedRunTimestamp, selectedTaskId]);

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
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Context</TableHead>
                    <TableHead>Last Run</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => {
                    const taskId = String(task.taskId || task.id || "-");
                    const status = String(task.status || "unknown");
                    const isSelected = taskId === selectedTaskId;
                    return (
                      <TableRow key={taskId} className={isSelected ? "bg-primary/5" : ""}>
                        <TableCell className="font-medium">{taskId}</TableCell>
                        <TableCell className="max-w-[16rem] truncate" title={task.title || ""}>
                          {String(task.title || "-")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={badgeClass(status)}>
                            {status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-muted-foreground">
                            <div>{`cron ${String(task.cron || "-")}`}</div>
                            <div>{`time ${String(task.time || "-")}`}</div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[14rem] truncate font-mono text-xs" title={task.contextId || ""}>
                          {String(task.contextId || "-")}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {task.lastRunTimestamp || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => setSelectedTaskId(taskId)}>
                              详情
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => onRunTask(taskId)}>
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
              <CardTitle>{`Task Detail · ${selectedTaskId}`}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="rounded-lg border border-border/70 bg-muted/35 px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">title</div>
                <div>{selectedTask.title || "-"}</div>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/35 px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">description</div>
                <div className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  {selectedTask.description || "-"}
                </div>
              </div>
              <div className="grid gap-2 rounded-lg border border-border/70 bg-muted/35 px-3 py-2 text-xs">
                <div>{`status: ${selectedTask.status || "-"}`}</div>
                <div>{`kind: ${selectedTask.kind || "-"}`}</div>
                <div>{`cron: ${selectedTask.cron || "-"}`}</div>
                <div>{`time: ${selectedTask.time || "-"}`}</div>
                <div>{`timezone: ${selectedTask.timezone || "-"}`}</div>
                <div className="truncate font-mono" title={selectedTask.contextId || ""}>{`contextId: ${selectedTask.contextId || "-"}`}</div>
                <div className="truncate font-mono" title={selectedTask.taskMdPath || ""}>{`taskMdPath: ${selectedTask.taskMdPath || "-"}`}</div>
                <div>{`requiredArtifacts: ${
                  Array.isArray(selectedTask.requiredArtifacts) && selectedTask.requiredArtifacts.length > 0
                    ? selectedTask.requiredArtifacts.join(", ")
                    : "-"
                }`}</div>
                <div>{`minOutputChars: ${selectedTask.minOutputChars ?? "-"}`}</div>
                <div>{`maxDialogueRounds: ${selectedTask.maxDialogueRounds ?? "-"}`}</div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border-border/80 bg-card/90 shadow-sm">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Run History</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void onLoadTaskRuns(selectedTaskId, 50).then((next) => setRuns(next))}
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
                        <TableHead>Timestamp</TableHead>
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
                          const status = String(run.status || run.executionStatus || "unknown");
                          return (
                            <TableRow key={run.timestamp} className={isActive ? "bg-primary/5" : ""}>
                              <TableCell className="font-mono text-xs">{run.timestamp}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={badgeClass(status)}>
                                  {status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{formatTime(run.startedAt)}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {formatDurationMs(run.startedAt, run.endedAt)}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{run.dialogueRounds ?? "-"}</TableCell>
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
                <CardTitle>{`Run Detail${selectedRunTimestamp ? ` · ${selectedRunTimestamp}` : ""}`}</CardTitle>
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
                      <div>{`status: ${String(selectedRunDetail.meta?.status || selectedRunDetail.meta?.executionStatus || "-")}`}</div>
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
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timeline</div>
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
