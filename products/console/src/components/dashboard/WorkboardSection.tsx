/**
 * Workboard Section。
 *
 * 关键点（中文）
 * - 页面级 section 负责错误态、选中态与刷新动作编排。
 * - 具体展示交给 `@downcity/ui` 的 Workboard 组件。
 */

import * as React from "react";
import { Workboard } from "@downcity/ui";
import { DashboardModule } from "@/components/dashboard/DashboardModule";
import type { UiWorkboardSnapshot } from "@/types/Workboard";

export interface WorkboardSectionProps {
  /**
   * 当前快照。
   */
  snapshot: UiWorkboardSnapshot | null;
  /**
   * 当前是否正在加载。
   */
  loading?: boolean;
  /**
   * 错误信息。
   */
  errorMessage?: string;
  /**
   * 手动刷新。
   */
  onRefresh?: () => void;
}

export function WorkboardSection(props: WorkboardSectionProps) {
  const [selectedActivityId, setSelectedActivityId] = React.useState("");

  React.useEffect(() => {
    const items = [
      ...(props.snapshot?.current || []),
      ...(props.snapshot?.recent || []),
    ];
    if (items.length === 0) {
      setSelectedActivityId("");
      return;
    }
    const matched = items.find((item) => item.id === selectedActivityId);
    if (!matched) {
      setSelectedActivityId(items[0]?.id || "");
    }
  }, [props.snapshot, selectedActivityId]);

  return (
    <DashboardModule
      title="Workboard"
      description="观察当前 agent 正在处理什么，以及最近完成过哪些工作。"
    >
      {props.errorMessage ? (
        <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {props.errorMessage}
        </div>
      ) : null}
      <Workboard
        snapshot={props.snapshot}
        loading={props.loading}
        selectedActivityId={selectedActivityId}
        onSelectActivity={setSelectedActivityId}
        onRefresh={props.onRefresh}
      />
    </DashboardModule>
  );
}
