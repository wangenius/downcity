import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { marketingTheme } from "@/lib/marketing-theme";

const PAGE = {
  zh: {
    badge: "Product",
    title: "Downcity 产品矩阵",
    subtitle: "不是一个单点工具，而是一组可组合的 Agent 产品：从 Console 到浏览器，再到 City SDK、Agent SDK 与 UI SDK。",
    cards: [
      {
        id: "console-ui",
        title: "Console UI",
        desc: "在浏览器里统一管理 Agent、上下文、任务、模型和渠道状态。",
        source: "products/console/",
      },
      {
        id: "chrome-extension",
        title: "Chrome Extension",
        desc: "在任意网页一键把内容投递给 Agent，减少复制粘贴和切换成本。",
        source: "products/chrome-extension/",
      },
      {
        id: "sdk",
        title: "City SDK",
        desc: "把 Downcity 的 city runtime、CLI 与 control plane 能力接入你的产品与运行体系。",
        source: "packages/cli/",
      },
      {
        id: "agent-sdk",
        title: "Agent SDK",
        desc: "把本地 Agent、RemoteAgent、Session 与 Plugin 组合进你的应用流程。",
        source: "packages/agent/",
      },
      {
        id: "ui-sdk",
        title: "Downcity UI SDK",
        desc: "复用 Downcity 的 UI 组件思路，快速搭建你的 Agent 工作台。",
        source: "packages/ui/",
      },
    ],
    factsTitle: "产品事实",
    facts: [
      "Console UI：独立前端包，目录为 products/console/。",
      "Chrome Extension：Manifest V3 插件，目录为 products/chrome-extension/。",
      "City SDK：核心 runtime、CLI 与平台能力位于 packages/cli/。",
      "Agent SDK：本地 Agent / RemoteAgent SDK 位于 packages/agent/。",
      "Downcity UI SDK：React + Tailwind 组件包目录为 packages/ui/。",
    ],
  },
  en: {
    badge: "Product",
    title: "Downcity Product Matrix",
    subtitle:
      "Not a single tool, but a set of composable products for agents: Console, browser entry, City SDK, Agent SDK, and UI SDK.",
    cards: [
      {
        id: "console-ui",
        title: "Console UI",
        desc: "Manage agents, contexts, tasks, models, and channels from one browser workspace.",
        source: "products/console/",
      },
      {
        id: "chrome-extension",
        title: "Chrome Extension",
        desc: "Send web content to your agent directly from any page with minimal context switching.",
        source: "products/chrome-extension/",
      },
      {
        id: "sdk",
        title: "City SDK",
        desc: "Integrate Downcity city runtime, CLI, and control-plane capabilities into your operating flow.",
        source: "packages/cli/",
      },
      {
        id: "agent-sdk",
        title: "Agent SDK",
        desc: "Embed local agents, RemoteAgent clients, sessions, and plugins into your application flow.",
        source: "packages/agent/",
      },
      {
        id: "ui-sdk",
        title: "Downcity UI SDK",
        desc: "Reuse Downcity UI patterns to build your own agent-facing workspace faster.",
        source: "packages/ui/",
      },
    ],
    factsTitle: "Product Facts",
    facts: [
      "Console UI is a dedicated frontend package under products/console/.",
      "Chrome Extension is a Manifest V3 extension under products/chrome-extension/.",
      "City SDK core runtime, CLI, and platform capabilities are in packages/cli/.",
      "Agent SDK local Agent and RemoteAgent runtime are in packages/agent/.",
      "Downcity UI SDK is the React + Tailwind component package under packages/ui/.",
    ],
  },
} as const;

/**
 * Product 概览页。
 * 说明：
 * 1. Product 仅展示真实产品线，不再使用抽象分组。
 * 2. 文案基于仓库目录与文档事实，避免空泛描述。
 */
export default function ProductOverviewPage() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.toLowerCase().startsWith("zh");
  const content = isZh ? PAGE.zh : PAGE.en;
  const basePath = isZh ? "/zh/product" : "/product";

  return (
    <div className={marketingTheme.pageNarrow}>
      <section>
        <span className={marketingTheme.badge}>
          {content.badge}
        </span>
        <h1 className={`mt-5 ${marketingTheme.pageTitle}`}>{content.title}</h1>
        <p className={`mt-4 ${marketingTheme.lead}`}>
          {content.subtitle}
        </p>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        {content.cards.map((card) => (
          <Link
            key={card.id}
            to={`${basePath}/${card.id}`}
            className={`${marketingTheme.panel} p-5 transition-colors hover:bg-card/92 md:p-6`}
          >
            <p className={marketingTheme.eyebrow}>
              {card.source}
            </p>
            <h2 className="mt-3 font-serif text-[1.5rem] font-semibold tracking-[-0.03em] text-foreground">
              {card.title}
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">{card.desc}</p>
          </Link>
        ))}
      </section>

      <section className={`${marketingTheme.panel} mt-10 p-5 md:p-6`}>
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
