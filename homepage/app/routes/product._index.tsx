import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { IconArrowUpRight } from "@tabler/icons-react";
import { marketingTheme } from "@/lib/marketing-theme";
import { cn } from "@/lib/utils";

const PAGE = {
  zh: {
    badge: "Product",
    title: "Downcity 是给 AI builders 的可复用 Agent 基础设施。",
    subtitle:
      "同一套 runtime 逻辑，被分发到本地宿主、浏览器控制面、网页入口、SDK 与 UI 组件层。你面对的是不同使用场景，不是互相割裂的产品线。",
    cards: [
      {
        id: "console-ui",
        title: "Console UI",
        desc: "浏览器里的总控面板，用来观察多 Agent 的上下文、任务和状态。",
        source: "products/console/",
      },
      {
        id: "chrome-extension",
        title: "Chrome Extension",
        desc: "把网页内容直接投递给 Agent，缩短内容采集与执行之间的距离。",
        source: "products/chrome-extension/",
      },
      {
        id: "sdk",
        title: "Shared Services SDK",
        desc: "把模型、身份、usage、支付和服务路由接入你自己的产品流程和业务系统。",
        source: "packages/city/",
      },
      {
        id: "ui-sdk",
        title: "Downcity UI SDK",
        desc: "复用 Downcity 的界面语言与工作台结构，快速搭建自己的 Agent 前台。",
        source: "docs/console-ui-react-v2.mdx",
      },
    ],
    factsTitle: "产品事实",
    facts: [
      "Console UI 是独立前端包，目录为 products/console/。",
      "Chrome Extension 基于 Manifest V3，目录为 products/chrome-extension/。",
      "Shared Services SDK 当前位于 packages/city/。",
      "UI SDK 当前由 packages/ui 与 products/console 的真实交互模式共同沉淀。",
    ],
  },
  en: {
    badge: "Product",
    title: "Downcity is reusable agent infrastructure for AI builders.",
    subtitle:
      "The same runtime logic is distributed across local hosting, browser control room, web entry, SDKs, and UI layer. You are choosing operating contexts, not disconnected products.",
    cards: [
      {
        id: "console-ui",
        title: "Console UI",
        desc: "A browser control room for observing multi-agent context, task flow, and state.",
        source: "products/console/",
      },
      {
        id: "chrome-extension",
        title: "Chrome Extension",
        desc: "Send web content straight into an agent so collection and execution stay close together.",
        source: "products/chrome-extension/",
      },
      {
        id: "sdk",
        title: "Shared Services SDK",
        desc: "Embed models, auth, usage, payment, and service routing into your own product flow and business system.",
        source: "packages/city/",
      },
      {
        id: "ui-sdk",
        title: "Downcity UI SDK",
        desc: "Reuse Downcity interface patterns to build your own agent-facing workspace faster.",
        source: "docs/console-ui-react-v2.mdx",
      },
    ],
    factsTitle: "Product Facts",
    facts: [
      "Console UI is a dedicated frontend package in products/console/.",
      "Chrome Extension is a Manifest V3 extension in products/chrome-extension/.",
      "Shared Services SDK currently lives in packages/city/.",
      "UI SDK capabilities are shaped by packages/ui and real Console interaction patterns.",
    ],
  },
} as const;

/**
 * Product 概览页。
 * 说明：
 * 1. 不做营销式堆砌，而是直接表达产品矩阵里的运行位置。
 * 2. 每个入口保留真实目录事实，帮助用户快速建立理解。
 */
export default function ProductOverviewPage() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.toLowerCase().startsWith("zh");
  const content = isZh ? PAGE.zh : PAGE.en;
  const basePath = isZh ? "/zh/product" : "/product";

  return (
    <div className={marketingTheme.pageNarrow}>
      <header className="grid gap-6 lg:grid-cols-[1fr_0.88fr] lg:items-end">
        <div className="space-y-4">
          <span className={marketingTheme.badge}>{content.badge}</span>
          <h1 className={marketingTheme.pageTitle}>{content.title}</h1>
        </div>
        <div className={`${marketingTheme.rail}`}>
          <p className={marketingTheme.lead}>{content.subtitle}</p>
        </div>
      </header>

      <section className={`${marketingTheme.panel} mt-8 overflow-hidden`}>
        {content.cards.map((card, index) => (
          <Link
            key={card.id}
            to={`${basePath}/${card.id}`}
            className={cn(
              "grid gap-4 px-5 py-5 transition-colors hover:bg-background/74 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-7",
              index !== content.cards.length - 1 && "border-b border-border/68",
            )}
          >
            <div>
              <p className={marketingTheme.eyebrow}>{card.source}</p>
              <h2 className="mt-2 font-serif text-[1.45rem] font-semibold tracking-[-0.04em] text-foreground">
                {card.title}
              </h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{card.desc}</p>
            </div>
            <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
              {isZh ? "查看" : "Open"}
              <IconArrowUpRight className="size-4" />
            </span>
          </Link>
        ))}
      </section>

      <section className={`${marketingTheme.panel} mt-8 p-6 md:p-7`}>
        <p className={marketingTheme.eyebrow}>{content.factsTitle}</p>
        <ul className="mt-4 space-y-2.5 text-sm leading-7 text-foreground/90">
          {content.facts.map((fact) => (
            <li key={fact} className="flex items-start gap-2">
              <span className={marketingTheme.listDot} />
              <span>{fact}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
