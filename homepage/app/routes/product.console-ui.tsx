import { useTranslation } from "react-i18next";
import { marketingTheme } from "@/lib/marketing-theme";

const PAGE = {
  zh: {
    title: "Product · Console UI",
    subtitle: "给团队一个可视化的 Agent 控制台，在浏览器里看全局、管流程、做决策。",
    highlights: [
      {
        title: "一屏掌握运行状态",
        description: "把 Agent、服务、扩展和任务放在同一工作台，不再靠多个终端窗口来回切。",
      },
      {
        title: "上下文与会话可追踪",
        description: "按上下文查看会话与历史，让团队成员接手任务时不需要从头了解背景。",
      },
      {
        title: "模型与配置可统一管理",
        description: "在 Console UI 里统一管理模型与常用配置，还能直接完成本地 ASR / TTS 插件的安装与启用。",
      },
    ],
    scenesTitle: "典型场景",
    scenes: [
      "日常值班：快速判断哪个 Agent 正在运行，哪个任务阻塞。",
      "协同交接：新人打开控制台即可接续上下文，而不是翻聊天记录。",
      "运营视角：用可视化界面观察多 Agent 的整体健康状态。",
    ],
    factsTitle: "事实对齐",
    facts: [
      "源码目录：console-ui/",
      "包名：@downcity/console-ui",
      "启动入口：city start",
    ],
  },
  en: {
    title: "Product · Console UI",
    subtitle:
      "A visual control room for your team to monitor, coordinate, and operate agents in the browser.",
    highlights: [
      {
        title: "One view for runtime status",
        description: "Track agents, services, plugins, and tasks in one workspace instead of many terminals.",
      },
      {
        title: "Traceable contexts and sessions",
        description: "Follow context history so handoffs stay smooth and nobody starts from scratch.",
      },
      {
        title: "Centralized model and config control",
        description: "Manage model settings from Console UI and install local ASR / TTS plugins without leaving the dashboard.",
      },
    ],
    scenesTitle: "Typical Scenarios",
    scenes: [
      "Ops shifts: quickly see which agent is healthy and which task is blocked.",
      "Team handoff: pick up context without replaying full chat history.",
      "Management view: monitor multi-agent operations from one dashboard.",
    ],
    factsTitle: "Facts",
    facts: [
      "Source directory: console-ui/",
      "Package name: @downcity/console-ui",
      "Start command: city start",
    ],
  },
} as const;

/**
 * Product Console UI 页面。
 * 说明：
 * 1. 以用户运营视角表达 Console UI 价值。
 * 2. 页面事实全部对应仓库现状，避免虚构能力。
 */
export default function ProductConsoleUiPage() {
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
