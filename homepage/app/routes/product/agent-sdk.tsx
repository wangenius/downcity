import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { marketingTheme } from "@/lib/marketing-theme";

const PAGE = {
  zh: {
    title: "Product · Agent SDK",
    subtitle:
      "把本地 Agent、RemoteAgent、Session、Service 与 Plugin 组合进你的应用流程，让 Agent 真正成为可嵌入的执行层。",
    docsCtaLabel: "查看 Agent SDK 文档",
    docsCtaHint: "接入方式、Session、Service、Plugin 与 API 说明都已经拆到独立的 agent-sdk-docs 中。",
    highlights: [
      {
        title: "本地 Agent 与远程 Agent 双入口",
        description: "同一套 SDK 既支持本地嵌入式 Agent，也支持通过 RemoteAgent 调用远程 HTTP Agent。",
      },
      {
        title: "围绕 Session 组织执行",
        description: "把 run、stream、history、fork 这些核心执行面稳定收束到 Session 模型上，方便应用侧持续集成。",
      },
      {
        title: "显式组合 Service 与 Plugin",
        description: "让调用方自己决定要注入哪些 service、plugin 和 tool，而不是依赖平台自动装配。",
      },
    ],
    scenesTitle: "典型场景",
    scenes: [
      "本地嵌入：在 Node 应用里直接 new Agent，把能力嵌进已有业务流。",
      "远程调用：用 RemoteAgent 连接已经暴露 HTTP 接口的 Agent 服务。",
      "能力编排：围绕 Session、Service、Plugin 组合你自己的执行壳。",
    ],
    factsTitle: "事实对齐",
    facts: [
      "包名：@downcity/agent",
      "核心源码目录：packages/agent/",
      "核心入口：Agent / RemoteAgent / Session",
    ],
  },
  en: {
    title: "Product · Agent SDK",
    subtitle:
      "Compose local Agents, RemoteAgent clients, sessions, services, and plugins into your application flow so the agent becomes an embeddable execution layer.",
    docsCtaLabel: "Open Agent SDK Docs",
    docsCtaHint: "Integration, sessions, services, plugins, and API guidance now live in the standalone agent-sdk-docs site.",
    highlights: [
      {
        title: "Two entry points: local and remote",
        description: "Use the same SDK for an embedded local Agent or for a RemoteAgent HTTP client that talks to another runtime.",
      },
      {
        title: "Execution organized around Session",
        description: "Keep run, stream, history, and fork centered on the Session model so application integration stays stable.",
      },
      {
        title: "Explicit service and plugin composition",
        description: "Let the caller decide which services, plugins, and tools are mounted instead of relying on automatic platform assembly.",
      },
    ],
    scenesTitle: "Typical Scenarios",
    scenes: [
      "Local embedding: instantiate Agent inside a Node app and wire it into an existing business flow.",
      "Remote calling: use RemoteAgent against an HTTP-exposed agent runtime.",
      "Capability composition: shape your own execution shell with sessions, services, and plugins.",
    ],
    factsTitle: "Facts",
    facts: [
      "Package name: @downcity/agent",
      "Core source directory: packages/agent/",
      "Core entry points: Agent / RemoteAgent / Session",
    ],
  },
} as const;

/**
 * Product Agent SDK 页面。
 * 说明：
 * 1. 这里聚焦 `@downcity/agent` 的嵌入式执行壳能力。
 * 2. 与 City SDK 分开后，用户能明确区分“平台运行层”和“应用嵌入层”。
 */
export default function ProductAgentSdkPage() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.toLowerCase().startsWith("zh");
  const content = isZh ? PAGE.zh : PAGE.en;
  const agentSdkDocsPath = isZh ? "/zh/agent-sdk-docs" : "/en/agent-sdk-docs";

  return (
    <div className={marketingTheme.pageNarrow}>
      <h1 className={marketingTheme.pageTitle}>{content.title}</h1>
      <p className={`mt-4 ${marketingTheme.lead}`}>{content.subtitle}</p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link to={agentSdkDocsPath} className={marketingTheme.primaryButton}>
          {content.docsCtaLabel}
        </Link>
        <p className="text-sm leading-7 text-muted-foreground">{content.docsCtaHint}</p>
      </div>

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
