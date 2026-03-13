/**
 * Tasks 运行状态区。
 */

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import type { UiTaskItem } from "../../types/Dashboard";

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
   * 手动执行任务。
   */
  onRunTask: (taskId: string) => void;
}

export function TasksSection(props: TasksSectionProps) {
  const { tasks, statusBadgeVariant, onRunTask } = props;

  const badgeClass = (status?: string): string => {
    const tone = statusBadgeVariant(status);
    if (tone === "ok") return "border-emerald-300 text-emerald-700";
    if (tone === "bad") return "border-destructive/40 text-destructive";
    return "border-amber-300 text-amber-700";
  };

  return (
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
                  <TableHead>Cron</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => {
                  const taskId = String(task.taskId || task.id || "-");
                  const status = String(task.status || "unknown");
                  return (
                    <TableRow key={taskId}>
                      <TableCell className="font-medium">{taskId}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={badgeClass(status)}>
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell>{String(task.cron || "-")}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => onRunTask(taskId)}>
                          run
                        </Button>
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
  );
}
