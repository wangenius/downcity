import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { IconArrowRight, IconPlayerPlayFilled } from "@tabler/icons-react";

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
        description: "先让本地有一个明确的运行入口。安装后会得到 `downcity` 命令（别名 `city`）。",
        command: "npm install -g downcity\ndowncity --version",
      },
      {
        title: "在仓库里创建 Agent",
        description: "进入真实项目目录后初始化，让规则、权限和产物落在仓库本身，而不是外部平台。",
        command: "cd /path/to/your-repo\ndowncity agent create .",
      },
      {
        title: "连接 City 并启动 Runtime",
        description: "先把当前 City 会话导入 downcity，再启动 runtime。默认后台运行，需要观察日志时再切前台模式。",
        command: "downcity federation use\ndowncity start\ndowncity agent start\n# 调试时\ndowncity agent start --foreground",
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
        description: "Establish one local runtime entry point first. Installing exposes the `downcity` command (alias `city`).",
        command: "npm install -g downcity\ndowncity --version",
      },
      {
        title: "Create the agent inside your repo",
        description: "Initialize inside a real project so rules, permissions, and artifacts stay in the repo instead of a separate platform.",
        command: "cd /path/to/your-repo\ndowncity agent create .",
      },
      {
        title: "Connect City and start runtime",
        description: "Import the active City session into downcity, then start the runtime. Use foreground mode only when you need live logs in the current shell.",
        command: "downcity federation use\ndowncity start\ndowncity agent start\n# for debugging\ndowncity agent start --foreground",
      },
      {
        title: "Run a health check",
        description: "Verify runtime state first, then add skills, channels, and scheduled tasks. Boundaries before expansion.",
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

/**
 * 快速开始文章页（Vibecape 风格）。
 * 说明：
 * 1. 四步线性路径，使用细边框卡片分隔。
 * 2. 统一的暖色主题与按钮样式。
 */
export function StartGuideSection() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.toLowerCase().startsWith("zh");
  const content = isZh ? START_GUIDE.zh : START_GUIDE.en;
  const docsQuickstartPath = isZh ? "/zh/docs/quickstart/getting-started" : "/en/docs/quickstart/getting-started";
  const homePath = isZh ? "/zh" : "/";

  return (
    <section className="mx-auto max-w-[1320px] px-5 py-16 md:px-8 md:py-24 lg:px-20">
      <div className="space-y-12 md:space-y-16">
        <header className="grid gap-6 lg:grid-cols-[1fr_0.9fr] lg:items-end">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-text-soft">
              {content.badge}
            </span>
            <h1 className="font-serif text-[clamp(1.875rem,4vw,2.25rem)] font-bold leading-[1.12] tracking-[-0.02em] text-foreground">
              {content.title}
            </h1>
          </div>
          <div className="space-y-4 border-l border-line pl-5">
            <p className="text-base leading-[1.65] text-text-soft">{content.intro}</p>
            <div className="flex flex-wrap gap-2">
              {content.notes.map((note) => (
                <span key={note} className="inline-flex items-center rounded-full border border-line bg-surface px-2.5 py-1 text-[0.7rem] text-text-soft">
                  {note}
                </span>
              ))}
            </div>
          </div>
        </header>

        <div className="overflow-hidden rounded-[14px] border border-line bg-card shadow-sm">
          {content.steps.map((step, index) => (
            <article
              key={step.title}
              className={cn(
                "px-5 py-6 md:px-8 md:py-8",
                index !== content.steps.length - 1 && "border-b border-line"
              )}
            >
              <div className="grid gap-5 md:grid-cols-[4rem_minmax(0,1fr)] md:gap-8">
                <p className="font-mono text-[0.7rem] font-medium uppercase tracking-[0.06em] text-text-subtle">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{step.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-text-soft">{step.description}</p>
                  </div>
                  <pre className="block overflow-x-auto rounded-xl border border-line bg-surface-soft px-4 py-3 font-mono text-[0.78rem] leading-6 text-foreground">
                    <code>{step.command}</code>
                  </pre>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="grid gap-6 rounded-[14px] border border-line bg-card p-6 shadow-sm md:grid-cols-[1fr_auto] md:items-end md:p-8">
          <div>
            <p className="text-[0.78rem] font-medium uppercase tracking-[0.04em] text-text-soft">{content.nextTitle}</p>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-soft">{content.nextDescription}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to={docsQuickstartPath}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-76"
            >
              <IconPlayerPlayFilled className="size-3.5" />
              {isZh ? "查看完整快速开始" : "Read Full Quick Start"}
            </Link>
            <Link
              to={homePath}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-foreground/[0.05] px-5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.08]"
            >
              {isZh ? "返回首页" : "Back Home"}
              <IconArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export default StartGuideSection;
