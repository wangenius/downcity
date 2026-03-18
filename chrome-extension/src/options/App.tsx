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
    <main className="options-root">
      <header className="header-card">
        <div className="brand-block">
          <img className="brand-logo" src="/icon-32.png" alt="ShipMyAgent logo" />
          <div>
            <h1>ShipMyAgent Settings</h1>
            <p>统一管理连接参数与常用问题模板</p>
          </div>
        </div>
      </header>

      <section className="card">
        <div className="section-title">连接配置</div>
        <div className="connection-grid">
          <label>
            IP / Host
            <input
              value={consoleHost}
              onChange={(event) => setConsoleHost(event.target.value)}
              placeholder="127.0.0.1"
            />
          </label>
          <label>
            Port
            <input
              value={consolePortInput}
              onChange={(event) => setConsolePortInput(event.target.value)}
              placeholder="5315"
            />
          </label>
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <div className="section-title">常用问题模板</div>
            <div className="section-subtitle">
              默认模板：{defaultPromptTitle}（popup 可快速填入）
            </div>
          </div>
          <div className="head-actions">
            <button className="ghost-btn" type="button" onClick={addPrompt}>
              新增模板
            </button>
            <button className="ghost-btn" type="button" onClick={resetDefaultPrompts}>
              恢复默认
            </button>
          </div>
        </div>

        {hasPrompts ? (
          <div className="prompt-list">
            {quickPrompts.map((item, index) => (
              <article key={item.id} className="prompt-item">
                <div className="prompt-item-head">
                  <label className="default-radio">
                    <input
                      type="radio"
                      name="defaultQuickPrompt"
                      checked={defaultQuickPromptId === item.id}
                      onChange={() => setDefaultQuickPromptId(item.id)}
                    />
                    <span>设为默认</span>
                  </label>
                  <button
                    className="text-btn"
                    type="button"
                    onClick={() => removePrompt(item.id)}
                  >
                    删除
                  </button>
                </div>
                <label>
                  模板名称 #{index + 1}
                  <input
                    value={item.title}
                    onChange={(event) =>
                      updatePromptField(item.id, "title", event.target.value)
                    }
                    placeholder="例如：可执行建议"
                  />
                </label>
                <label>
                  模板内容
                  <textarea
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
          <div className="empty-prompts">暂无模板，请新增或恢复默认模板。</div>
        )}
      </section>

      <footer className="footer-bar">
        <div className={`status-text status-${status.type}`}>{status.text}</div>
        <button className="primary-btn" type="button" onClick={() => void saveAllSettings()}>
          {isSaving ? "保存中..." : "保存设置"}
        </button>
      </footer>
    </main>
  );
}
