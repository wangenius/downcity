import type { FC } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IconFileText, IconSettings } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { marketingTheme } from "@/lib/marketing-theme";
import {
  MarketingPanel,
  marketingFilterButtonClass,
  marketingTagClass,
} from "@/components/shared/marketing-elements";

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
 * 代码预览模块。
 * 说明：
 * 1. 不再堆叠说明卡和代码卡，而是用一个配置面板完成认知闭环。
 * 2. PROFILE.md 与 ship.json 分别代表“行为规则”和“执行权限”。
 */
export const CodePreviewSection: FC = () => {
  const { i18n, t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"agent" | "ship">("agent");
  const isZh = i18n.language.toLowerCase().startsWith("zh");
  const content = activeTab === "agent" ? AGENT_MD_CONTENT : SHIP_JSON_CONTENT;

  return (
    <section className={marketingTheme.page}>
      <div className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
        <div className="space-y-4">
          <span className={marketingTheme.badge}>{isZh ? "Config Surface" : "Config Surface"}</span>
          <h2 className={marketingTheme.sectionTitle}>{t("features:features.repo.title")}</h2>
          <p className={marketingTheme.lead}>{t("features:features.repo.description")}</p>
          <div className={`${marketingTheme.rail} space-y-3`}>
            <p className={marketingTheme.body}>
              {isZh
                ? "Agent 的可靠性不是来自一个神秘平台，而是来自仓库里可见、可审计、可接管的配置结构。"
                : "Agent reliability does not come from a hidden platform. It comes from visible, auditable, and takeover-friendly configuration living in the repo."}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("agent")}
                className={cn(
                  marketingFilterButtonClass({
                    active: activeTab === "agent",
                    className: "h-auto gap-2 px-3 py-2 text-[0.62rem] uppercase tracking-[0.16em]",
                  }),
                )}
              >
                <IconFileText className="size-3.5" />
                PROFILE.md
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("ship")}
                className={cn(
                  marketingFilterButtonClass({
                    active: activeTab === "ship",
                    className: "h-auto gap-2 px-3 py-2 text-[0.62rem] uppercase tracking-[0.16em]",
                  }),
                )}
              >
                <IconSettings className="size-3.5" />
                ship.json
              </button>
            </div>
          </div>
        </div>

        <MarketingPanel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/68 px-5 py-4 md:px-6">
            <div>
              <p className={marketingTheme.eyebrow}>{activeTab === "agent" ? "Behavior Layer" : "Execution Layer"}</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {activeTab === "agent"
                  ? t("features:codePreview.agentMdDesc")
                  : t("features:codePreview.shipJsonDesc")}
              </p>
            </div>
            <span className={marketingTagClass({ tone: "soft" })}>
              {activeTab === "agent" ? "PROFILE.md" : "ship.json"}
            </span>
          </div>
          <div className="p-4 md:p-5">
            <pre className={marketingTheme.code}>
              <code>{content}</code>
            </pre>
          </div>
        </MarketingPanel>
      </div>
    </section>
  );
};
