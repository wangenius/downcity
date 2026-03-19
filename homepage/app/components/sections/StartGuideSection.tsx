import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { IconArrowRight, IconPlayerPlayFilled } from "@tabler/icons-react";
import { marketingTheme } from "@/lib/marketing-theme";

/**
 * 快速开始文章页。
 * 说明：
 * 1. 把启动流程压缩成一条线性的四步路径，减少首次接入的认知负担。
 * 2. 用编辑式排版承接首页视觉，而不是回到旧式文档卡片。
 */
type StartStep = {
  title: string;
  description: string;
  command: string;
};

type StartContent = {
  badge: string;
  title: string;
  intro: string;
  steps: StartStep[];
  notes: string[];
  nextTitle: string;
  nextDescription: string;
};

const START_GUIDE: Record<"zh" | "en", StartContent> = {
  zh: {
    badge: "Quick Start",
    title: "用一条最短路径，把第一个项目接入 Downcity。",
    intro:
      "不要先搭复杂控制面，也不要先重构流程。直接从你已经在运行的仓库开始，四步就能把目录变成可持续运行的 Agent 工作域。",
    steps: [
      {
        title: "安装 CLI",
        description: "先让本地有一个明确的运行入口。`downcity` 与 `city` 都可作为命令名使用。",
        command: "npm install -g downcity\ndowncity --version",
      },
      {
        title: "在仓库里创建 Agent",
        description: "进入真实项目目录后初始化，让规则、权限和产物落在仓库本身，而不是外部平台。",
        command: "cd /path/to/your-repo\ncity agent create .",
      },
      {
        title: "配置模型并启动 Runtime",
        description: "写入 `.env` 后启动 runtime。默认后台运行，需要观察日志时再切前台模式。",
        command: "LLM_API_KEY=your_key\n\ncity start\ncity agent start\n# 调试时\ncity agent start --foreground",
      },
      {
        title: "做一次健康检查",
        description: "确认服务状态、再开始接技能、渠道和自动任务。先保证边界成立，再扩展自动化。",
        command: "curl http://localhost:3000/health\ncurl http://localhost:3000/api/status",
      },
    ],
    notes: [
      "建议直接从一个真实仓库开始，不要先用玩具项目演练。",
      "先跑一个最小闭环，再接入审批、技能和更多渠道。",
      "如果团队多人协作，先确定目录边界，再讨论角色分工。",
    ],
    nextTitle: "继续进入文档",
    nextDescription: "如果这四步已经跑通，下一步就进入完整快速开始文档，把配置、技能与任务自动化接上。",
  },
  en: {
    badge: "Quick Start",
    title: "Connect your first project to Downcity through one shortest path.",
    intro:
      "Do not build a control plane first and do not rewrite workflow first. Start from the repo you already run. In four steps, the folder becomes a durable agent operating block.",
    steps: [
      {
        title: "Install the CLI",
        description: "Establish one local runtime entry point first. Both `downcity` and `city` are valid command names.",
        command: "npm install -g downcity\ndowncity --version",
      },
      {
        title: "Create the agent inside your repo",
        description: "Initialize inside a real project so rules, permissions, and artifacts stay in the repo instead of a separate platform.",
        command: "cd /path/to/your-repo\ncity agent create .",
      },
      {
        title: "Configure model and start runtime",
        description: "Create `.env`, then start the runtime. Use foreground mode only when you need live logs in the current shell.",
        command: "LLM_API_KEY=your_key\n\ncity start\ncity agent start\n# for debugging\ncity agent start --foreground",
      },
      {
        title: "Run a health check",
        description: "Verify service state first, then add skills, channels, and scheduled tasks. Boundaries before expansion.",
        command: "curl http://localhost:3000/health\ncurl http://localhost:3000/api/status",
      },
    ],
    notes: [
      "Start from one real repository, not a demo project.",
      "Close one minimal loop before adding approvals, skills, or extra channels.",
      "If multiple people operate the system, define folder boundaries before role split.",
    ],
    nextTitle: "Continue in the docs",
    nextDescription: "Once the four steps are working, move into the full quick-start guide and connect configuration, skills, and automation.",
  },
};

export function StartGuideSection() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.toLowerCase().startsWith("zh");
  const content = isZh ? START_GUIDE.zh : START_GUIDE.en;
  const docsQuickstartPath = isZh
    ? "/zh/docs/quickstart/getting-started"
    : "/en/docs/quickstart/getting-started";
  const homePath = isZh ? "/zh" : "/";

  return (
    <section className={marketingTheme.pageNarrow}>
      <div className={marketingTheme.sectionGap}>
        <header className="grid gap-6 lg:grid-cols-[1fr_0.9fr] lg:items-end">
          <div className="space-y-4">
            <span className={marketingTheme.badge}>{content.badge}</span>
            <h1 className={marketingTheme.pageTitle}>{content.title}</h1>
          </div>
          <div className={`${marketingTheme.rail} space-y-4`}>
            <p className={marketingTheme.lead}>{content.intro}</p>
            <div className="flex flex-wrap gap-2">
              {content.notes.map((note) => (
                <span key={note} className={marketingTheme.chip}>
                  {note}
                </span>
              ))}
            </div>
          </div>
        </header>

        <section className={`${marketingTheme.panel} overflow-hidden`}>
          {content.steps.map((step, index) => (
            <article
              key={step.title}
              className={index !== content.steps.length - 1 ? "border-b border-border/68 px-5 py-5 md:px-7" : "px-5 py-5 md:px-7"}
            >
              <div className="grid gap-4 md:grid-cols-[5rem_minmax(0,1fr)] md:gap-6">
                <div>
                  <p className={marketingTheme.eyebrow}>{String(index + 1).padStart(2, "0")}</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <h2 className="font-serif text-[1.6rem] font-semibold tracking-[-0.04em] text-foreground">
                      {step.title}
                    </h2>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">{step.description}</p>
                  </div>
                  <pre className={marketingTheme.code}>
                    <code>{step.command}</code>
                  </pre>
                </div>
              </div>
            </article>
          ))}
        </section>

        <footer className={`${marketingTheme.panel} grid gap-5 p-6 md:grid-cols-[1fr_auto] md:items-end md:p-7`}>
          <div>
            <p className={marketingTheme.eyebrow}>{content.nextTitle}</p>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">{content.nextDescription}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to={docsQuickstartPath} className={marketingTheme.primaryButton}>
              <IconPlayerPlayFilled className="size-3.5" />
              {isZh ? "查看完整快速开始" : "Read Full Quick Start"}
            </Link>
            <Link to={homePath} className={marketingTheme.secondaryButton}>
              {isZh ? "返回首页" : "Back Home"}
              <IconArrowRight className="size-4" />
            </Link>
          </div>
        </footer>
      </div>
    </section>
  );
}

export default StartGuideSection;
