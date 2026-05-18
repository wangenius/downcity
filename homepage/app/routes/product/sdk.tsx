import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { marketingTheme } from "@/lib/marketing-theme";

const PAGE = {
  zh: {
    title: "Product · City SDK",
    subtitle: "把 city runtime、CLI、control plane 与能力平台接入你的运行体系，让仓库、Agent 与运维边界保持统一。",
    docsCtaLabel: "查看 City SDK 文档",
    docsCtaHint: "Quick Start、CLI、配置、Service、Operations 都在主 docs 中。",
    highlights: [
      {
        title: "统一 city runtime 与控制平面",
        description: "围绕 CLI、daemon、Console 网关和平台能力组织同一套运行逻辑，而不是把执行链路拆散到多个入口。",
      },
      {
        title: "以仓库为边界组织运行",
        description: "让配置、命令、Service、任务与状态都围绕 city 的 repo-native 结构展开，降低运维与排障成本。",
      },
      {
        title: "从本地到团队部署一致",
        description: "用同一套 city 入口承接本地验证、Console 暴露、渠道接入与生产运行，不必维护多套操作面。",
      },
    ],
    scenesTitle: "典型场景",
    scenes: [
      "团队运行入口：统一启动 city、Console、channel 和 service 运行态。",
      "CLI 驱动运维：把 agent 创建、启动、重载、状态检查都收束到一套命令面。",
      "平台化接入：在你自己的部署体系里承接模型、任务、联系人、记忆与 shell 能力。",
    ],
    factsTitle: "事实对齐",
    facts: [
      "包名：@downcity/city",
      "核心源码目录：packages/city/",
      "CLI 命令：city / downcity",
    ],
  },
  en: {
    title: "Product · City SDK",
    subtitle:
      "Integrate the city runtime, CLI, control plane, and capability platform into one operating surface for your workflows.",
    docsCtaLabel: "Open City SDK Docs",
    docsCtaHint: "Quick start, CLI, configuration, services, and operations live in the main docs.",
    highlights: [
      {
        title: "Unify runtime and control plane",
        description: "Keep CLI, daemon, Console gateway, and platform capability flow inside one city runtime model instead of splitting operations across separate surfaces.",
      },
      {
        title: "Organize operations around the repo",
        description: "Let configuration, commands, services, tasks, and state all follow one repo-native city structure.",
      },
      {
        title: "Keep local and team deployment aligned",
        description: "Use the same city entry surface for local validation, Console exposure, channel access, and production operation.",
      },
    ],
    scenesTitle: "Typical Scenarios",
    scenes: [
      "Team runtime entry: start city, Console, channels, and services from one operating surface.",
      "CLI-driven operations: create, start, reload, and inspect agents through one command layer.",
      "Platform integration: host model, task, contact, memory, and shell capabilities inside your own deployment boundary.",
    ],
    factsTitle: "Facts",
    facts: [
      "Package name: @downcity/city",
      "Core source directory: packages/city/",
      "CLI commands: city / downcity",
    ],
  },
} as const;

/**
 * Product City SDK 页面。
 * 说明：
 * 1. 这里聚焦 city runtime、CLI、control plane 这一条产品线。
 * 2. Agent SDK 独立到 `/product/agent-sdk`，避免两种 SDK 语义混在一起。
 */
export default function ProductSdkPage() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.toLowerCase().startsWith("zh");
  const content = isZh ? PAGE.zh : PAGE.en;
  const docsPath = isZh ? "/zh/docs" : "/en/docs";

  return (
    <div className={marketingTheme.pageNarrow}>
      <h1 className={marketingTheme.pageTitle}>{content.title}</h1>
      <p className={`mt-4 ${marketingTheme.lead}`}>{content.subtitle}</p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link to={docsPath} className={marketingTheme.primaryButton}>
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
