import type { FC } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IconFileText, IconSettings } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

const AGENT_MD_CONTENT = `# Personality
You are a Market Researcher.
Traits: Insightful, data-driven.

# Workspace
This repository is your workspace.

# Capabilities
## Scripts
You can run tools in ./scripts/:
- ./scripts/fetch_news.ts
- ./scripts/analyze.py

## Coding
- Use web/data tools when needed
- Write & execute custom scripts
  in the ./code/ directory
`;

const SHIP_JSON_CONTENT = `{
  "name": "developer-agent",
  "permissions": {
    "shell": {
      "requiresApproval": false,
      "maxOutputChars": 12000,
      "maxOutputLines": 200
    }
  }
}`;

/**
 * 代码预览模块（Vibecape 风格）。
 * 说明：
 * 1. 左侧标题与切换按钮，右侧配置面板。
 * 2. 使用新主题变量，保持细边框与柔和背景。
 */
export const CodePreviewSection: FC = () => {
  const { i18n, t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"agent" | "ship">("agent");
  const isZh = i18n.language.toLowerCase().startsWith("zh");
  const content = activeTab === "agent" ? AGENT_MD_CONTENT : SHIP_JSON_CONTENT;

  return (
    <section className="bg-background py-20 md:py-28">
      <div className="mx-auto grid max-w-[1600px] gap-10 px-5 md:px-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-start lg:gap-16 lg:px-20">
        <div className="space-y-5">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-text-soft">
            {isZh ? "Config Surface" : "Config Surface"}
          </span>
          <h2 className="font-serif text-[clamp(1.625rem,3vw,2.25rem)] font-bold leading-[1.12] tracking-[-0.02em] text-foreground">
            {t("features:features.repo.title")}
          </h2>
          <p className="text-base leading-[1.65] text-text-soft">{t("features:features.repo.description")}</p>
          <p className="text-sm leading-relaxed text-text-soft">
            {isZh
              ? "Agent 的可靠性不是来自一个神秘平台，而是来自仓库里可见、可审计、可接管的配置结构。"
              : "Agent reliability does not come from a hidden platform. It comes from visible, auditable, and takeover-friendly configuration living in the repo."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("agent")}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[0.72rem] font-medium uppercase tracking-[0.06em] transition-colors",
                activeTab === "agent"
                  ? "border-line-strong bg-surface-soft text-foreground"
                  : "border-line bg-surface text-text-soft hover:bg-surface-soft hover:text-foreground"
              )}
            >
              <IconFileText className="size-3.5" />
              PROFILE.md
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("ship")}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[0.72rem] font-medium uppercase tracking-[0.06em] transition-colors",
                activeTab === "ship"
                  ? "border-line-strong bg-surface-soft text-foreground"
                  : "border-line bg-surface text-text-soft hover:bg-surface-soft hover:text-foreground"
              )}
            >
              <IconSettings className="size-3.5" />
              downcity.json
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-[14px] border border-line bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-line px-5 py-4 md:px-6">
            <div>
              <p className="text-[0.7rem] font-medium uppercase tracking-[0.06em] text-text-subtle">
                {activeTab === "agent" ? "Behavior Layer" : "Execution Layer"}
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {activeTab === "agent" ? t("features:codePreview.agentMdDesc") : t("features:codePreview.shipJsonDesc")}
              </p>
            </div>
            <span className="inline-flex items-center rounded-full border border-line bg-surface px-2.5 py-1 text-[0.72rem] text-text-soft">
              {activeTab === "agent" ? "PROFILE.md" : "downcity.json"}
            </span>
          </div>
          <div className="p-4 md:p-5">
            <pre className="block overflow-x-auto rounded-xl border border-line bg-surface-soft px-4 py-3 font-mono text-[0.78rem] leading-6 text-foreground">
              <code>{content}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CodePreviewSection;
