import { useTranslation } from "react-i18next";

const PAGE = {
  zh: {
    title: "Product · Chrome Extension",
    subtitle: "把网页内容直接送进 Agent 工作流，让浏览器成为你最轻量的协作入口。",
    highlights: [
      {
        title: "网页即入口",
        description: "浏览内容时无需切换到控制台，直接在当前页面完成投递。",
      },
      {
        title: "选区直发",
        description: "选区右下角出现消息按钮，点击后在选区左下角展开输入框；点击扩展图标会打开插件 popup。",
      },
      {
        title: "降低信息损耗",
        description: "插件会带上页面标题、链接和正文摘要，减少转述导致的信息丢失。",
      },
    ],
    scenesTitle: "典型场景",
    scenes: [
      "研究资料整理：把网页重点片段快速发给 Agent 生成结构化结论。",
      "运营与市场：浏览竞品页面时实时发起分析任务。",
      "客服与支持：把用户问题页面上下文直接附带给 Agent 处理。",
    ],
    factsTitle: "事实对齐",
    facts: [
      "源码目录：chrome-extension/",
      "技术形态：Chrome Extension Manifest V3",
      "交互能力：选区消息按钮 + Cmd/Ctrl + U（页面内） + 扩展图标 popup",
    ],
  },
  en: {
    title: "Product · Chrome Extension",
    subtitle:
      "Turn any webpage into an agent entry point and send context without leaving the browser.",
    highlights: [
      {
        title: "Webpage-first workflow",
        description: "Capture and send tasks from the page you are reading, without console switching.",
      },
      {
        title: "Selection to agent",
        description: "Use the selection message button or Cmd/Ctrl + U for inline send, while extension icon click opens the popup flow.",
      },
      {
        title: "Less context loss",
        description: "Package page title, URL, and content context so agents receive cleaner inputs.",
      },
    ],
    scenesTitle: "Typical Scenarios",
    scenes: [
      "Research: send key passages for structured summaries.",
      "Marketing ops: trigger analysis while reviewing competitor pages.",
      "Support: forward issue context directly from user-facing pages.",
    ],
    factsTitle: "Facts",
    facts: [
      "Source directory: chrome-extension/",
      "Technical form: Chrome Extension Manifest V3",
      "Interaction capability: selection message button + Cmd/Ctrl + U inline + extension popup",
    ],
  },
} as const;

/**
 * Product Chrome Extension 页面。
 * 说明：
 * 1. 聚焦“网页到 Agent”这一用户价值链路。
 * 2. 所有能力点来源于扩展 README 与现有实现说明。
 */
export default function ProductChromeExtensionPage() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.toLowerCase().startsWith("zh");
  const content = isZh ? PAGE.zh : PAGE.en;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12 md:px-6 md:py-20">
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{content.title}</h1>
      <p className="mt-4 text-base leading-8 text-muted-foreground">{content.subtitle}</p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {content.highlights.map((item) => (
          <article key={item.title} className="rounded-xl border border-border/80 p-5 md:p-6">
            <h2 className="text-lg font-semibold">{item.title}</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.description}</p>
          </article>
        ))}
      </div>

      <section className="mt-8 rounded-xl border border-border/80 p-5 md:p-6">
        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {content.scenesTitle}
        </h3>
        <ul className="mt-3 space-y-2 text-sm leading-7 text-foreground/90">
          {content.scenes.map((scene) => (
            <li key={scene}>• {scene}</li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-xl border border-border/80 p-5 md:p-6">
        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {content.factsTitle}
        </h3>
        <ul className="mt-3 space-y-2 text-sm leading-7 text-foreground/90">
          {content.facts.map((fact) => (
            <li key={fact}>• {fact}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
