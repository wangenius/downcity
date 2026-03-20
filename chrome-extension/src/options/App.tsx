/**
 * Options 设置页。
 *
 * 关键点（中文）：
 * - 独立承载插件设置，避免 popup 过载。
 * - 支持连接配置与常用问题模板（默认模板可选）。
 * - 保存后统一落到 storage.sync，popup 自动复用。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ExtensionQuickPromptItem,
  ExtensionSettings,
} from "../types/extension";
import {
  DEFAULT_QUICK_PROMPTS,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
} from "../services/storage";

type OptionsStatus = {
  type: "idle" | "success" | "error" | "loading";
  text: string;
};

function getStatusToneClass(type: OptionsStatus["type"]): string {
  switch (type) {
    case "success":
      return "text-[#1f8a4c]";
    case "error":
      return "text-[#b2392e]";
    case "loading":
      return "text-[#af7f1f]";
    default:
      return "text-muted-foreground";
  }
}

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

function createQuickPromptId(): string {
  return `quick_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toEditablePromptList(
  prompts: ExtensionQuickPromptItem[],
): ExtensionQuickPromptItem[] {
  return prompts.map((item) => ({ ...item }));
}

function normalizePromptDraftList(
  prompts: ExtensionQuickPromptItem[],
): ExtensionQuickPromptItem[] {
  const out: ExtensionQuickPromptItem[] = [];
  const idSet = new Set<string>();
  for (const item of prompts) {
    const id = String(item.id || "").trim() || createQuickPromptId();
    if (idSet.has(id)) continue;
    const title = String(item.title || "").replace(/\s+/g, " ").trim();
    const prompt = String(item.prompt || "").trim();
    if (!title || !prompt) continue;
    out.push({
      id,
      title: title.slice(0, 40),
      prompt: prompt.slice(0, 5000),
    });
    idSet.add(id);
  }
  return out;
}

const shellClass = "rounded-[24px] border border-border bg-surface shadow-soft";
const insetClass = "rounded-[18px] border border-border bg-muted";
const fieldLabelClass =
  "flex flex-col gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground";
const fieldControlClass =
  "w-full rounded-[12px] border border-border bg-surface px-3 py-2.5 text-[12px] text-foreground outline-none transition focus:border-[#d9d9de] focus:ring-0";
const ghostButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-[12px] border border-border bg-surface px-4 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60";
const primaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-[12px] border border-primary bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-[#232326] disabled:cursor-not-allowed disabled:opacity-60";

export function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [consoleHost, setConsoleHost] = useState(DEFAULT_SETTINGS.consoleHost);
  const [consolePortInput, setConsolePortInput] = useState(
    String(DEFAULT_SETTINGS.consolePort),
  );
  const [quickPrompts, setQuickPrompts] = useState<ExtensionQuickPromptItem[]>(
    toEditablePromptList(DEFAULT_SETTINGS.quickPrompts),
  );
  const [defaultQuickPromptId, setDefaultQuickPromptId] = useState(
    DEFAULT_SETTINGS.defaultQuickPromptId,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<OptionsStatus>({
    type: "idle",
    text: "可编辑后点击保存",
  });

  const hasPrompts = quickPrompts.length > 0;
  const defaultPromptTitle = useMemo(() => {
    const found = quickPrompts.find((item) => item.id === defaultQuickPromptId);
    return found?.title || "未设置";
  }, [defaultQuickPromptId, quickPrompts]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const loaded = await loadSettings();
        if (!mounted) return;
        setSettings(loaded);
        setConsoleHost(loaded.consoleHost);
        setConsolePortInput(String(loaded.consolePort));
        setQuickPrompts(toEditablePromptList(loaded.quickPrompts));
        setDefaultQuickPromptId(loaded.defaultQuickPromptId);
        setStatus({ type: "idle", text: "设置已加载" });
      } catch (error) {
        if (!mounted) return;
        setStatus({ type: "error", text: `加载失败：${readErrorText(error)}` });
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const addPrompt = useCallback(() => {
    setQuickPrompts((prev) => [
      ...prev,
      {
        id: createQuickPromptId(),
        title: `常用问题 ${prev.length + 1}`,
        prompt: "",
      },
    ]);
  }, []);

  const updatePromptField = useCallback(
    (id: string, field: "title" | "prompt", value: string) => {
      setQuickPrompts((prev) =>
        prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
      );
    },
    [],
  );

  const removePrompt = useCallback((id: string) => {
    setQuickPrompts((prev) => prev.filter((item) => item.id !== id));
    setDefaultQuickPromptId((prev) => (prev === id ? "" : prev));
  }, []);

  const resetDefaultPrompts = useCallback(() => {
    const restored = DEFAULT_QUICK_PROMPTS.map((item) => ({ ...item }));
    setQuickPrompts(restored);
    setDefaultQuickPromptId(restored[0]?.id || "");
    setStatus({ type: "idle", text: "已恢复默认常用问题模板" });
  }, []);

  const saveAllSettings = useCallback(async () => {
    const host = String(consoleHost || "").trim() || "127.0.0.1";
    const port = parsePortInput(consolePortInput);
    if (!port) {
      setStatus({ type: "error", text: "端口范围应为 1-65535" });
      return;
    }

    const normalizedPrompts = normalizePromptDraftList(quickPrompts);
    if (normalizedPrompts.length === 0) {
      setStatus({ type: "error", text: "至少保留一个有效的常用问题模板" });
      return;
    }

    const safeDefaultQuickPromptId = normalizedPrompts.some(
      (item) => item.id === defaultQuickPromptId,
    )
      ? defaultQuickPromptId
      : normalizedPrompts[0].id;

    const nextSettings: ExtensionSettings = {
      ...settings,
      consoleHost: host,
      consolePort: port,
      quickPrompts: normalizedPrompts,
      defaultQuickPromptId: safeDefaultQuickPromptId,
    };

    setIsSaving(true);
    setStatus({ type: "loading", text: "保存中..." });
    try {
      await saveSettings(nextSettings);
      setSettings(nextSettings);
      setQuickPrompts(toEditablePromptList(nextSettings.quickPrompts));
      setDefaultQuickPromptId(nextSettings.defaultQuickPromptId);
      setStatus({ type: "success", text: "已保存，popup 打开后会自动生效" });
    } catch (error) {
      setStatus({ type: "error", text: `保存失败：${readErrorText(error)}` });
    } finally {
      setIsSaving(false);
    }
  }, [consoleHost, consolePortInput, defaultQuickPromptId, quickPrompts, settings]);

  return (
    <main className="mx-auto my-4 flex w-[min(920px,calc(100vw-24px))] flex-col gap-4">
      <header className="flex items-center gap-3 px-1">
        <img
          className="h-5 w-5 object-cover"
          src="/image.png"
          alt="Downcity logo"
        />
        <div className="flex flex-col">
          <div className="text-[0.62rem] uppercase tracking-[0.22em] text-muted-foreground">
            Extension
          </div>
          <h1 className="m-0 text-lg font-medium tracking-[-0.02em] text-foreground">
            Downcity Settings
          </h1>
        </div>
      </header>

      <section className={shellClass}>
        <div className="grid gap-0">
          <section className="border-b border-border px-5 py-5">
            <div className="grid gap-3 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-6">
              <div className="space-y-1">
                <div className="text-[0.62rem] uppercase tracking-[0.22em] text-muted-foreground">
                  Connection
                </div>
                <h2 className="text-base font-medium text-foreground">连接配置</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  保持一个最短路径，只配置 extension 连接到哪个 Console。
                </p>
              </div>
              <div className={`${insetClass} grid gap-3 p-4 md:grid-cols-[minmax(220px,1fr)_140px]`}>
                <label className={fieldLabelClass}>
                  IP / Host
                  <input
                    className={fieldControlClass}
                    value={consoleHost}
                    onChange={(event) => setConsoleHost(event.target.value)}
                    placeholder="127.0.0.1"
                  />
                </label>
                <label className={fieldLabelClass}>
                  Port
                  <input
                    className={fieldControlClass}
                    value={consolePortInput}
                    onChange={(event) => setConsolePortInput(event.target.value)}
                    placeholder="5315"
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="px-5 py-5">
            <div className="grid gap-3 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-6">
              <div className="space-y-1">
                <div className="text-[0.62rem] uppercase tracking-[0.22em] text-muted-foreground">
                  Prompt Library
                </div>
                <h2 className="text-base font-medium text-foreground">常用问题模板</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  默认模板：{defaultPromptTitle}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button className={ghostButtonClass} type="button" onClick={addPrompt}>
                    新增模板
                  </button>
                  <button className={ghostButtonClass} type="button" onClick={resetDefaultPrompts}>
                    恢复默认
                  </button>
                </div>

                {hasPrompts ? (
                  <div className="grid gap-2.5">
                    {quickPrompts.map((item, index) => (
                      <article
                        key={item.id}
                        className={`${insetClass} flex flex-col gap-3 p-4`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label className="inline-flex items-center gap-2 text-[11px] font-medium text-foreground">
                            <input
                              type="radio"
                              name="defaultQuickPrompt"
                              checked={defaultQuickPromptId === item.id}
                              onChange={() => setDefaultQuickPromptId(item.id)}
                            />
                            <span>设为默认</span>
                          </label>
                          <button
                            className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                            type="button"
                            onClick={() => removePrompt(item.id)}
                          >
                            删除
                          </button>
                        </div>
                        <label className={fieldLabelClass}>
                          模板名称 #{index + 1}
                          <input
                            className={fieldControlClass}
                            value={item.title}
                            onChange={(event) =>
                              updatePromptField(item.id, "title", event.target.value)
                            }
                            placeholder="例如：可执行建议"
                          />
                        </label>
                        <label className={fieldLabelClass}>
                          模板内容
                          <textarea
                            className={`${fieldControlClass} min-h-[92px] resize-y`}
                            rows={4}
                            value={item.prompt}
                            onChange={(event) =>
                              updatePromptField(item.id, "prompt", event.target.value)
                            }
                            placeholder="例如：阅读附件后，给出 3 条可执行建议。"
                          />
                        </label>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className={`${insetClass} px-4 py-4 text-sm text-muted-foreground`}>
                    暂无模板，请新增或恢复默认模板。
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </section>

      <footer className="flex items-center justify-between gap-3 px-1">
        <div className={`text-sm ${getStatusToneClass(status.type)}`}>{status.text}</div>
        <button
          className={primaryButtonClass}
          type="button"
          onClick={() => void saveAllSettings()}
        >
          {isSaving ? "保存中..." : "保存设置"}
        </button>
      </footer>
    </main>
  );
}
