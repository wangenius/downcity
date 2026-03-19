import { useTranslation } from "react-i18next";
import { marketingTheme } from "@/lib/marketing-theme";

const PAGE = {
  zh: {
    title: "Product · Downcity UI SDK",
    subtitle: "把 Downcity 的交互语言复用到你的产品里，让 Agent 工作台搭建更快、更统一。",
    highlights: [
      {
        title: "统一视觉与交互",
        description: "继承 Downcity Console 的信息组织方式，保持团队界面体验一致。",
      },
      {
        title: "降低 UI 搭建成本",
        description: "围绕 Agent 场景复用组件模式，减少重复造轮子。",
      },
      {
        title: "从产品形态反推组件能力",
        description: "以真实 Console 场景沉淀可复用 UI 原语，而不是抽象空组件。",
      },
    ],
    scenesTitle: "典型场景",
    scenes: [
      "自研控制台：基于一致的组件模式快速搭建内部 Agent 面板。",
      "品牌化落地：在保留能力结构的同时做你自己的视觉包装。",
      "多产品统一：让多个团队产品共享同一套 Agent UI 语言。",
    ],
    factsTitle: "事实对齐",
    facts: [
      "文档命名：console-ui-kit（见 docs/console-ui-react-v2.mdx）",
      "命名参考：@downcity/console-ui-kit",
      "当前组件能力来源：console-ui 的真实页面与交互沉淀",
    ],
  },
  en: {
    title: "Product · Downcity UI SDK",
    subtitle:
      "Reuse Downcity's interaction language in your own product and build agent workspaces with consistent UX.",
    highlights: [
      {
        title: "Consistent visual and interaction model",
        description: "Carry over Console-style information architecture for predictable team experience.",
      },
      {
        title: "Lower UI build cost",
        description: "Reuse agent-focused component patterns instead of rebuilding every surface.",
      },
      {
        title: "Components shaped by real product use",
        description: "Patterns are derived from practical console workflows, not abstract-only UI demos.",
      },
    ],
    scenesTitle: "Typical Scenarios",
    scenes: [
      "Internal console: ship your own agent workspace faster with proven UI patterns.",
      "Brand adaptation: keep capability structure while applying your own visual identity.",
      "Multi-product consistency: share one agent UI language across teams.",
    ],
    factsTitle: "Facts",
    facts: [
      "Documentation naming: console-ui-kit (see docs/console-ui-react-v2.mdx)",
      "Naming reference: @downcity/console-ui-kit",
      "Current capability source: patterns extracted from console-ui workflows",
    ],
  },
} as const;

/**
 * Product Downcity UI SDK 页面。
 * 说明：
 * 1. 明确 UI SDK 的用户价值是“复用 Agent 交互语言”。
 * 2. 事实依据来自现有文档与 console-ui 代码组织，不编造发布状态。
 */
export default function ProductUiSdkPage() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.toLowerCase().startsWith("zh");
  const content = isZh ? PAGE.zh : PAGE.en;

  return (
    <div className={marketingTheme.pageNarrow}>
      <h1 className={marketingTheme.pageTitle}>{content.title}</h1>
      <p className={`mt-4 ${marketingTheme.lead}`}>{content.subtitle}</p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {content.highlights.map((item) => (
          <article key={item.title} className={`${marketingTheme.panel} p-5 md:p-6`}>
            <h2 className="font-serif text-[1.35rem] font-semibold tracking-[-0.03em] text-foreground">
              {item.title}
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.description}</p>
          </article>
        ))}
      </div>

      <section className={`${marketingTheme.panel} mt-8 p-5 md:p-6`}>
        <h3 className={marketingTheme.eyebrow}>{content.scenesTitle}</h3>
        <ul className="mt-4 space-y-2 text-sm leading-7 text-foreground/90">
          {content.scenes.map((scene) => (
            <li key={scene}>• {scene}</li>
          ))}
        </ul>
      </section>

      <section className={`${marketingTheme.panel} mt-6 p-5 md:p-6`}>
        <h3 className={marketingTheme.eyebrow}>{content.factsTitle}</h3>
        <ul className="mt-4 space-y-2 text-sm leading-7 text-foreground/90">
          {content.facts.map((fact) => (
            <li key={fact}>• {fact}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
