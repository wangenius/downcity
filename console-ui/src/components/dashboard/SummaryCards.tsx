/**
 * Agent 概览区（极简重构版）。
 *
 * 关键点（中文）
 * - 仅保留决策相关信息：运行基础信息 + 核心计数 + 异常清单。
 * - 不再堆叠多张表格，避免 overview 视觉噪音。
 * - 详情信息下沉到对应功能页（Services / Context / Extensions）。
 */

import * as React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type {
  UiAgentOption,
  UiConfigStatusItem,
  UiModelSummary,
  UiOverviewResponse,
  UiServiceItem,
  UiTaskItem,
} from "../../types/Dashboard";

export interface SummaryCardsProps {
  /**
   * 当前路由对应的 agent。
   */
  selectedAgent: UiAgentOption | null;
  /**
   * 概览数据快照。
   */
  overview: UiOverviewResponse | null;
  /**
   * service 列表快照。
   */
  services: UiServiceItem[];
  /**
   * local_ui context id。
   */
  localUiContextId: string;
  /**
   * 配置状态列表。
   */
  configStatus: UiConfigStatusItem[];
  /**
   * 任务列表。
   */
  tasks: UiTaskItem[];
  /**
   * 模型快照。
   */
  model: UiModelSummary | null;
  /**
   * 切换 model.primary。
   */
  onSwitchModel: (primaryModelId: string) => void;
}

function KV(props: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-2 py-1.5 text-sm">
      <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{props.label}</div>
      <div className={props.muted ? "truncate text-muted-foreground" : "truncate text-foreground"} title={props.value}>
        {props.value}
      </div>
    </div>
  );
}

export function SummaryCards(props: SummaryCardsProps) {
  const { selectedAgent, overview, services, localUiContextId, configStatus, tasks, model, onSwitchModel } = props;

  if (!selectedAgent) {
    return <div className="py-6 text-sm text-muted-foreground">未选择 agent</div>;
  }

  const contexts = Array.isArray(overview?.contexts?.items) ? overview.contexts.items : [];
  const chatProfiles = Array.isArray(selectedAgent.chatProfiles) ? selectedAgent.chatProfiles : [];
  const agentConfigItems = configStatus.filter((item) => item.scope === "agent");
  const badConfigItems = agentConfigItems.filter((item) => String(item.status || "").toLowerCase() !== "ok");
  const localUiExists = contexts.some((item) => item.contextId === localUiContextId);
  const availableModels = Array.isArray(model?.availableModels) ? model.availableModels : [];
  const currentModelId = String(model?.agentPrimaryModelId || model?.primaryModelId || selectedAgent.primaryModelId || "").trim();
  const [targetModelId, setTargetModelId] = React.useState(currentModelId);

  React.useEffect(() => {
    setTargetModelId(currentModelId);
  }, [currentModelId]);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <div className="truncate text-xl font-semibold leading-none text-foreground">{selectedAgent.name || "-"}</div>
        <div className="truncate text-xs text-muted-foreground">{selectedAgent.projectRoot || selectedAgent.id || "-"}</div>
      </div>

      <div className="grid gap-x-6 md:grid-cols-2">
        <div>
          <KV label="SMA" value={String(overview?.smaVersion || "-")} />
          <KV label="PID" value={String(selectedAgent.daemonPid || "-")} />
          <KV label="Host" value={String(selectedAgent.host || "-")} />
          <KV label="Port" value={selectedAgent.port ? String(selectedAgent.port) : "-"} />
          <KV
            label="Contexts"
            value={`${overview?.contexts?.total || 0} total · local_ui ${localUiExists ? "ok" : "missing"}`}
            muted
          />
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-2 py-1.5 text-sm">
            <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Model</div>
            <Select
              value={targetModelId || undefined}
              onValueChange={(value) => {
                const nextModelId = String(value || "").trim();
                setTargetModelId(nextModelId);
                if (!nextModelId || nextModelId === currentModelId) return;
                onSwitchModel(nextModelId);
              }}
            >
              <SelectTrigger className="h-8 w-full bg-muted/35">
                <SelectValue placeholder="选择 model.primary" />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((item) => {
                  const modelId = String(item.id || "").trim();
                  if (!modelId) return null;
                  return (
                    <SelectItem key={modelId} value={modelId}>
                      {`${modelId} · ${item.name || "-"} · ${item.providerType || "-"}${item.isPaused ? " · paused" : ""}`}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-2 py-1.5 text-sm">
            <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Services</div>
            <div className="flex flex-wrap gap-1">
              {services.length === 0 ? (
                <span className="text-xs text-muted-foreground">-</span>
              ) : (
                services.map((item, index) => {
                  const name = String(item.name || item.service || `service-${index}`).trim();
                  const state = String(item.state || item.status || "unknown").trim().toLowerCase();
                  const tone =
                    state === "running" || state === "ok" || state === "active" || state === "enabled" || state === "idle" || state === "success"
                      ? "bg-emerald-500/10 text-emerald-700"
                      : state === "error" || state === "failed"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted text-muted-foreground";
                  return (
                    <span key={`${name}:${index}`} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${tone}`}>
                      {`${name} · ${state || "-"}`}
                    </span>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Tasks</div>
        {tasks.length === 0 ? (
          <div className="text-sm text-muted-foreground">暂无任务</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="px-0 py-2 font-medium">Title</th>
                  <th className="px-2 py-2 font-medium">Kind</th>
                  <th className="px-2 py-2 font-medium">Context</th>
                  <th className="px-2 py-2 font-medium">Last Run</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task, index) => {
                  const title = String(task.title || "").trim() || `task-${index}`;
                  return (
                    <tr key={`${title}:${index}`} className="border-b border-border/35">
                      <td className="px-0 py-2 font-medium">{title}</td>
                      <td className="px-2 py-2 text-muted-foreground">{String(task.kind || "-")}</td>
                      <td className="px-2 py-2 font-mono text-[12px] text-muted-foreground">{String(task.contextId || "-")}</td>
                      <td className="px-2 py-2 text-muted-foreground">{String(task.lastRunTimestamp || "-")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Chat</div>
        {chatProfiles.length === 0 ? (
          <div className="text-sm text-muted-foreground">暂无 chat channel</div>
        ) : (
          <div className="space-y-1">
            {chatProfiles.map((item, index) => {
              const state = String(item.linkState || item.statusText || "unknown");
              return (
                <div key={`${item.channel || "channel"}:${index}`} className="grid grid-cols-[9rem_1fr] gap-2 text-sm">
                  <div className="truncate text-muted-foreground">{String(item.channel || "-")}</div>
                  <div className="truncate">{`${String(item.identity || "-")} · ${state}`}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {badConfigItems.length > 0 ? (
        <div className="rounded-md bg-destructive/8 px-3 py-2">
          <div className="text-xs font-medium text-destructive">{`配置异常 ${badConfigItems.length} 项`}</div>
          <div className="mt-1 text-xs text-destructive/90">
            {badConfigItems.map((item) => `${item.label}(${item.reason || item.status || "unknown"})`).join(" · ")}
          </div>
        </div>
      ) : null}
    </section>
  );
}
