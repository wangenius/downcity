import { useTranslation } from "react-i18next";
import { marketingTheme } from "@/lib/marketing-theme";

const PAGE = {
  zh: {
    title: "Product · Downcity SDK",
    subtitle: "把 Agent Runtime 能力接入你的业务流程，让自动化从命令行走向产品级集成。",
    highlights: [
      {
        title: "把 Runtime 接进现有系统",
        description: "通过 Downcity 的运行时与 API 接口，把 Agent 纳入你已有的业务链路。",
      },
      {
        title: "统一任务与服务能力",
        description: "围绕 chat、skill、task、memory 组织能力，方便你按场景组合。",
      },
      {
        title: "从试验到生产一致",
        description: "同一套能力既能本地验证，也能迁移到团队协作环境持续运行。",
      },
    ],
    scenesTitle: "典型场景",
    scenes: [
      "业务系统接入：在你自己的产品里触发 Agent 执行与回传。",
      "流程自动化：把周期性任务交给 runtime 持续执行。",
      "团队协作：统一入口管理模型、任务与消息通道。",
    ],
    factsTitle: "事实对齐",
    facts: [
      "核心源码目录：packages/downcity/",
      "安装命令：npm i -g downcity",
      "README 快速流程：city start → city agent create . → city agent start",
    ],
  },
  en: {
    title: "Product · Downcity SDK",
    subtitle:
      "Integrate agent runtime capabilities into your business workflows, beyond standalone CLI usage.",
    highlights: [
      {
        title: "Embed runtime into existing systems",
        description: "Use Downcity runtime and APIs to bring agent execution into your own product loops.",
      },
      {
        title: "Unified service capabilities",
        description: "Compose scenarios around chat, skill, task, and memory services.",
      },
      {
        title: "From local trials to team operation",
        description: "Use the same capability model from local validation to collaborative production workflows.",
      },
    ],
    scenesTitle: "Typical Scenarios",
    scenes: [
      "Product integration: trigger and consume agent runs from your app.",
      "Workflow automation: run recurring tasks with runtime scheduling.",
      "Team operation: unify model, task, and channel operations.",
    ],
    factsTitle: "Facts",
    facts: [
      "Core source directory: packages/downcity/",
      "Install command: npm i -g downcity",
      "README quick flow: city start -> city agent create . -> city agent start",
    ],
  },
} as const;

/**
 * Product Downcity SDK 页面。
 * 说明：
 * 1. 用用户集成场景说明 SDK 价值，而非堆叠底层实现。
 * 2. 事实项直接锚定 packages/downcity 与 README 的现有内容。
 */
export default function ProductSdkPage() {
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
        <h3 className={marketingTheme.eyebrow}>
          {content.scenesTitle}
        </h3>
        <ul className="mt-4 space-y-2 text-sm leading-7 text-foreground/90">
          {content.scenes.map((scene) => (
            <li key={scene}>• {scene}</li>
          ))}
        </ul>
      </section>

      <section className={`${marketingTheme.panel} mt-6 p-5 md:p-6`}>
        <h3 className={marketingTheme.eyebrow}>
          {content.factsTitle}
        </h3>
        <ul className="mt-4 space-y-2 text-sm leading-7 text-foreground/90">
          {content.facts.map((fact) => (
            <li key={fact}>• {fact}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
