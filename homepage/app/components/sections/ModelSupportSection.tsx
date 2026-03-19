import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { marketingTheme } from "@/lib/marketing-theme";

const RUNTIMES = [
  { name: "Node.js", version: "v20+" },
  { name: "Bun", version: "v1.1+" },
  { name: "Python", version: "3.10+" },
  { name: "Docker", version: "Native" },
] as const;

const MODELS = [
  { name: "Claude 3.5 Sonnet", type: "Cloud", tags: ["Reasoning", "Coding"] },
  { name: "GPT-4o", type: "Cloud", tags: ["General"] },
  { name: "DeepSeek V3", type: "Hybrid", tags: ["Performant"] },
  { name: "Llama 3", type: "Local", tags: ["Private", "Ollama"] },
] as const;

/**
 * 模型与运行时支持模块。
 * 说明：
 * 1. 用一个面板承载两类兼容性信息，避免零散卡片造成视觉噪声。
 * 2. 运行时强调接入面，模型强调选择空间。
 */
export const ModelSupportSection: FC = () => {
  const { i18n, t } = useTranslation();
  const isZh = i18n.language.toLowerCase().startsWith("zh");

  return (
    <section className={marketingTheme.pageNarrow}>
      <header className="space-y-4">
        <span className={marketingTheme.badge}>Runtime + Models</span>
        <h2 className={marketingTheme.pageTitle}>{t("models:title")}</h2>
        <p className={marketingTheme.lead}>{t("models:description")}</p>
      </header>

      <section className={`${marketingTheme.panel} mt-8 grid overflow-hidden md:grid-cols-2`}>
        <div className="border-b border-border/68 px-5 py-5 md:border-b-0 md:border-r md:px-7 md:py-7">
          <p className={marketingTheme.eyebrow}>{t("models:runtime")}</p>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            {isZh
              ? "运行时层决定你把 Agent 放进什么环境里启动与维护。"
              : "The runtime layer defines where agents start and how they are maintained."}
          </p>
          <div className="mt-5 space-y-2">
            {RUNTIMES.map((runtime) => (
              <div key={runtime.name} className={`${marketingTheme.panelSoft} flex items-center justify-between px-4 py-3`}>
                <span className="text-sm font-medium text-foreground">{runtime.name}</span>
                <span className={marketingTheme.chip}>{runtime.version}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 py-5 md:px-7 md:py-7">
          <p className={marketingTheme.eyebrow}>{t("models:models")}</p>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            {isZh
              ? "模型层不是被绑定的平台选择，而是按业务场景做出的运行决策。"
              : "Model support is not platform lock-in. It is an operating choice matched to the job."}
          </p>
          <div className="mt-5 space-y-2">
            {MODELS.map((model) => (
              <div key={model.name} className={`${marketingTheme.panelSoft} px-4 py-3`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{model.name}</span>
                  <span className={marketingTheme.chip}>{model.type}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {model.tags.map((tag) => (
                    <span key={tag} className={marketingTheme.chip}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </section>
  );
};

export default ModelSupportSection;
