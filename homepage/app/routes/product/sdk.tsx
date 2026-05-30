import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { marketingTheme } from "@/lib/marketing-theme";

const PAGE = {
  zh: {
    title: "Product · City SDK",
    subtitle: "把 City runtime、Gate 调用方式与公共服务接入你的产品体系，让多个 Studio 复用同一座服务城市。",
    docsCtaLabel: "查看 City SDK 文档",
    docsCtaHint: "Quick Start、CLI、配置、Plugins、Operations 都在主 docs 中。",
    highlights: [
      {
        title: "统一 City runtime 与公共服务",
        description: "围绕 service、action、auth、env 和 studio 访问边界组织同一套服务城市，而不是每个产品重建一套后端。",
      },
      {
        title: "以仓库为边界组织运行",
        description: "让服务、模型、账户、用量与支付都围绕 City 的共享边界展开，降低多产品复用成本。",
      },
      {
        title: "从本地到团队部署一致",
        description: "用同一套 City 组合承接本地验证、Node 部署与 Edge 部署，不必维护多套服务底座。",
      },
    ],
    scenesTitle: "典型场景",
    scenes: [
      "共享服务城市：让多个 Studio 或产品共用一套账户、模型、用量和支付服务。",
      "Gate 接入：前端、扩展或后端通过 Gate 访问 City，而不是直接耦合数据库。",
      "部署组合：用 cities/node 或 cities/edge 组合适配不同运行环境。",
    ],
    factsTitle: "事实对齐",
    facts: [
      "核心包名：@downcity/city",
      "核心源码目录：packages/city/",
      "管理入口：city manage",
    ],
  },
  en: {
    title: "Product · City SDK",
    subtitle:
      "Integrate the City runtime, Gate access, and public services into one shared service city for multiple studios.",
    docsCtaLabel: "Open City SDK Docs",
    docsCtaHint: "Quick start, CLI, configuration, plugins, and operations live in the main docs.",
    highlights: [
      {
        title: "Unify City runtime and public services",
        description: "Keep services, actions, auth, env, and studio boundaries inside one shared service city instead of rebuilding a backend per product.",
      },
      {
        title: "Organize operations around the repo",
        description: "Let service data, model records, accounts, usage, and payment state follow one reusable City boundary.",
      },
      {
        title: "Keep local and team deployment aligned",
        description: "Use the same City composition across local validation, Node deployment, and edge deployment.",
      },
    ],
    scenesTitle: "Typical Scenarios",
    scenes: [
      "Shared service city: let multiple studios or products reuse accounts, models, usage, and payment services.",
      "Gate access: call City from frontend, extension, or backend code without coupling to database internals.",
      "Deployment composition: use cities/node or cities/edge for different runtime targets.",
    ],
    factsTitle: "Facts",
    facts: [
      "Core package: @downcity/city",
      "Core source directory: packages/city/",
      "Management entry: city manage",
    ],
  },
} as const;

/**
 * Product City SDK 页面。
 * 说明：
 * 1. 这里聚焦 City runtime、Gate 与 services 这一条产品线。
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
