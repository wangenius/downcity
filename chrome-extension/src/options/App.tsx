/**
 * Options 设置页。
 *
 * 关键点（中文）：
 * - 只保留扩展运行必需设置：Console 地址与默认 Agent。
 * - 设置页只负责配置，不承载发送流程。
 * - Agent 列表按当前连接地址实时拉取，保存后 popup 直接复用。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConsoleUiAgentOption } from "../types/api";
import type { ExtensionSettings } from "../types/extension";
import {
  buildConsoleBaseUrl,
  fetchAgents,
} from "../services/downcityApi";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
} from "../services/storage";
import type { PopupSelectOption } from "../types/PopupSelect";
import { PopupSelect } from "../popup/PopupSelect";

type OptionsStatus = {
  /** 状态类型（中文）：用于控制提示色。 */
  type: "idle" | "success" | "error" | "loading";
  /** 状态文案（中文）：展示给用户的当前状态。 */
  text: string;
};

function readErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || "未知错误");
}

function parsePortInput(value: string): number | null {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return null;
  if (parsed < 1 || parsed > 65535) return null;
  return Math.trunc(parsed);
}

function getStatusClass(type: OptionsStatus["type"]): string {
  if (type === "success") return "text-[#166534]";
  if (type === "error") return "text-[#7f1d1d]";
  if (type === "loading") return "text-[#9a6700]";
  return "text-muted-foreground";
}

function resolveAgentId(
  agents: ConsoleUiAgentOption[],
  preferredAgentId: string,
  selectedAgentId: string,
): string {
  const preferred = String(preferredAgentId || "").trim();
  if (preferred && agents.some((item) => item.id === preferred)) {
    return preferred;
  }
  const selected = String(selectedAgentId || "").trim();
  if (selected && agents.some((item) => item.id === selected)) {
    return selected;
  }
  return agents[0]?.id || "";
}

export function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [consoleHost, setConsoleHost] = useState(DEFAULT_SETTINGS.consoleHost);
  const [consolePortInput, setConsolePortInput] = useState(
    String(DEFAULT_SETTINGS.consolePort),
  );
  const [agents, setAgents] = useState<ConsoleUiAgentOption[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [status, setStatus] = useState<OptionsStatus>({
    type: "idle",
    text: "修改后保存即可",
  });

  const agentOptions = useMemo<PopupSelectOption[]>(
    () =>
      agents.map((item) => ({
        value: item.id,
        label: item.name,
        description: item.running ? "在线" : "未运行",
      })),
    [agents],
  );

  const refreshAgents = useCallback(
    async (params?: {
      host?: string;
      port?: string;
      preferredAgentId?: string;
    }) => {
      const host = String(params?.host ?? consoleHost).trim() || "127.0.0.1";
      const port = parsePortInput(String(params?.port ?? consolePortInput));
      if (!port) {
        setStatus({ type: "error", text: "端口范围应为 1-65535" });
        return;
      }

      let consoleBaseUrl = "";
      try {
        consoleBaseUrl = buildConsoleBaseUrl({ host, port });
      } catch (error) {
        setStatus({ type: "error", text: readErrorText(error) });
        return;
      }

      setIsLoadingAgents(true);
      setStatus({ type: "loading", text: "加载 Agent 中..." });
      try {
        const response = await fetchAgents({ consoleBaseUrl });
        const nextAgents = response.agents || [];
        const nextAgentId = resolveAgentId(
          nextAgents,
          String(params?.preferredAgentId ?? settings.agentId),
          response.selectedAgentId,
        );

        setAgents(nextAgents);
        setSettings((prev) => ({
          ...prev,
          consoleHost: host,
          consolePort: port,
          agentId: nextAgentId,
        }));
        setStatus({
          type: "idle",
          text:
            nextAgents.length > 0
              ? `已加载 ${nextAgents.length} 个 Agent`
              : "未发现 Agent，请先启动 city agent start",
        });
      } catch (error) {
        setAgents([]);
        setStatus({
          type: "error",
          text: `加载 Agent 失败：${readErrorText(error)}`,
        });
      } finally {
        setIsLoadingAgents(false);
      }
    },
    [consoleHost, consolePortInput, settings.agentId],
  );

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const loaded = await loadSettings();
        if (!mounted) return;
        setSettings(loaded);
        setConsoleHost(loaded.consoleHost);
        setConsolePortInput(String(loaded.consolePort));
        await refreshAgents({
          host: loaded.consoleHost,
          port: String(loaded.consolePort),
          preferredAgentId: loaded.agentId,
        });
      } catch (error) {
        if (!mounted) return;
        setStatus({ type: "error", text: `初始化失败：${readErrorText(error)}` });
      }
    })();
    return () => {
      mounted = false;
    };
  }, [refreshAgents]);

  const saveAllSettings = useCallback(async () => {
    const host = String(consoleHost || "").trim() || "127.0.0.1";
    const port = parsePortInput(consolePortInput);
    if (!port) {
      setStatus({ type: "error", text: "端口范围应为 1-65535" });
      return;
    }

    const nextSettings: ExtensionSettings = {
      ...settings,
      consoleHost: host,
      consolePort: port,
      agentId: String(settings.agentId || "").trim(),
    };

    setIsSaving(true);
    setStatus({ type: "loading", text: "保存中..." });
    try {
      await saveSettings(nextSettings);
      setSettings(nextSettings);
      setStatus({ type: "success", text: "已保存，popup 会自动使用新设置" });
    } catch (error) {
      setStatus({ type: "error", text: `保存失败：${readErrorText(error)}` });
    } finally {
      setIsSaving(false);
    }
  }, [consoleHost, consolePortInput, settings]);

  return (
    <main className="mx-auto my-6 flex w-[min(720px,calc(100vw-32px))] flex-col gap-4">
      <header className="rounded-[18px] border border-border bg-surface px-5 py-4">
        <div className="text-[0.62rem] uppercase tracking-[0.22em] text-muted-foreground">
          Extension
        </div>
        <h1 className="mt-1 text-xl font-medium tracking-[-0.02em] text-foreground">
          Chrome Extension Settings
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          这里只保留连接信息和默认 Agent。popup 里只负责发送。
        </p>
      </header>

      <section className="rounded-[18px] border border-border bg-surface p-5">
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px_auto]">
            <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              IP / Host
              <input
                className="w-full rounded-[12px] border border-border bg-muted px-3 py-2.5 text-[12px] text-foreground outline-none transition focus:border-[#d9d9de] focus:bg-surface"
                value={consoleHost}
                onChange={(event) => setConsoleHost(event.target.value)}
                placeholder="127.0.0.1"
              />
            </label>

            <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Port
              <input
                className="w-full rounded-[12px] border border-border bg-muted px-3 py-2.5 text-[12px] text-foreground outline-none transition focus:border-[#d9d9de] focus:bg-surface"
                value={consolePortInput}
                onChange={(event) => setConsolePortInput(event.target.value)}
                placeholder="5315"
              />
            </label>

            <div className="flex items-end">
              <button
                className="inline-flex min-h-10 items-center justify-center rounded-[12px] border border-border bg-muted px-4 text-[12px] font-medium text-foreground transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void refreshAgents()}
                disabled={isLoadingAgents}
              >
                {isLoadingAgents ? "刷新中..." : "刷新 Agent"}
              </button>
            </div>
          </div>

          <PopupSelect
            label="Default Agent"
            value={settings.agentId}
            placeholder={
              isLoadingAgents
                ? "加载 Agent 中..."
                : agentOptions.length > 0
                  ? "请选择默认 Agent"
                  : "暂无可用 Agent"
            }
            options={agentOptions}
            onChange={(value) =>
              setSettings((prev) => ({
                ...prev,
                agentId: value,
              }))
            }
            disabled={isLoadingAgents || agentOptions.length === 0}
          />
        </div>
      </section>

      <footer className="flex items-center justify-between gap-3 rounded-[18px] border border-border bg-surface px-5 py-4">
        <div className={`text-sm ${getStatusClass(status.type)}`}>{status.text}</div>
        <button
          className="inline-flex min-h-11 items-center justify-center rounded-[12px] border border-primary bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-[#232326] disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          onClick={() => void saveAllSettings()}
          disabled={isSaving}
        >
          {isSaving ? "保存中..." : "保存设置"}
        </button>
      </footer>
    </main>
  );
}
