import { Link } from "react-router";
import { useTranslation } from "react-i18next";

type StartSection = {
  title: string;
  paragraphs: string[];
  code?: string;
};

type StartContent = {
  title: string;
  intro: string;
  sections: StartSection[];
  nextTitle: string;
  nextDescription: string;
};

const START_GUIDE: Record<"zh" | "en", StartContent> = {
  zh: {
    title: "快速开始 Downcity",
    intro:
      "这是一篇可直接照做的启动文章。按顺序完成以下步骤，你可以在 10 分钟内跑起一个可对话、可执行的 Downcity Runtime。",
    sections: [
      {
        title: "1. 安装 CLI",
        paragraphs: [
          "先全局安装 CLI，并确认命令可用。`downcity` 与 `city` 都可使用。",
        ],
        code: `npm install -g downcity\ndowncity --version`,
      },
      {
        title: "2. 在仓库里初始化 Agent",
        paragraphs: [
          "进入你的项目目录后创建/初始化 agent。系统会生成 `PROFILE.md`、`ship.json` 与 `.ship/` 目录。",
        ],
        code: `cd /path/to/your-repo\ncity agent create .`,
      },
      {
        title: "3. 配置模型并启动 Runtime",
        paragraphs: [
          "在项目根目录写入 `.env`，然后启动 runtime（默认后台 daemon）。需要在当前终端观察日志时再用前台模式。",
        ],
        code: `LLM_API_KEY=your_key\n\ncity start\ncity agent start\n# 或（前台调试）\ncity agent start --foreground`,
      },
      {
        title: "4. 健康检查与下一步",
        paragraphs: [
          "启动后先确认服务健康，再进入配置、技能与任务自动化。",
        ],
        code: `curl http://localhost:3000/health\ncurl http://localhost:3000/api/status`,
      },
    ],
    nextTitle: "继续深入",
    nextDescription: "如果你已经跑通启动流程，下一步建议进入完整文档的快速开始章节。",
  },
  en: {
    title: "Quick Start Downcity",
    intro:
      "This article is designed to be executable step by step. Follow it in order and you can launch a conversational Downcity runtime in about 10 minutes.",
    sections: [
      {
        title: "1. Install CLI",
        paragraphs: [
          "Install the global CLI first and verify the command is available. `downcity` and `city` are equivalent.",
        ],
        code: `npm install -g downcity\ndowncity --version`,
      },
      {
        title: "2. Initialize in your repository",
        paragraphs: [
          "Create/init the agent project inside your repository. It creates `PROFILE.md`, `ship.json`, and `.ship/`.",
        ],
        code: `cd /path/to/your-repo\ncity agent create .`,
      },
      {
        title: "3. Configure model and start runtime",
        paragraphs: [
          "Create `.env` in project root, then start runtime (default: background daemon). Use foreground mode when you want logs in the current terminal.",
        ],
        code: `LLM_API_KEY=your_key\n\ncity start\ncity agent start\n# or (foreground)\ncity agent start --foreground`,
      },
      {
        title: "4. Health check and next steps",
        paragraphs: [
          "After startup, verify service health first, then move on to configuration, skills, and task automation.",
        ],
        code: `curl http://localhost:3000/health\ncurl http://localhost:3000/api/status`,
      },
    ],
    nextTitle: "Go Deeper",
    nextDescription: "If startup is working, continue with the full quick-start documentation.",
  },
};

/**
 * 快速开始文章页。
 * 说明：
 * 1. 采用与首页一致的文章化结构。
 * 2. 直接给出可执行命令，降低首次上手成本。
 */
export function StartGuideSection() {
  const { i18n } = useTranslation();
  const isZh = i18n.language === "zh";
  const content = isZh ? START_GUIDE.zh : START_GUIDE.en;
  const docsQuickstartPath = isZh
    ? "/zh/docs/quickstart/getting-started"
    : "/en/docs/quickstart/getting-started";
  const homePath = isZh ? "/zh" : "/";

  return (
    <section className="pt-8 pb-8 md:pt-10 md:pb-10">
      <div className="mx-auto w-full max-w-4xl px-4 md:px-6">
        <article className="mx-auto max-w-4xl space-y-10">
          <header className="space-y-4">
            <h1 className="text-balance font-serif text-4xl leading-[1.12] tracking-tight md:text-5xl">
              {content.title}
            </h1>
            <p className="text-base leading-8 text-muted-foreground md:text-lg">
              {content.intro}
            </p>
          </header>

          {content.sections.map((section) => (
            <section key={section.title} className="space-y-4">
              <h2 className="font-serif text-2xl leading-tight tracking-tight text-foreground md:text-3xl">
                {section.title}
              </h2>
              <div className="space-y-3 text-base leading-8 text-muted-foreground md:text-lg">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              {section.code ? (
                <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/45 px-4 py-3">
                  <code className="font-mono text-sm leading-7 text-foreground">
                    {section.code}
                  </code>
                </pre>
              ) : null}
            </section>
          ))}

          <footer className="space-y-3 border-t border-border/50 pt-5">
            <h3 className="font-serif text-2xl tracking-tight text-foreground">
              {content.nextTitle}
            </h3>
            <p className="text-base leading-7 text-muted-foreground md:text-lg">
              {content.nextDescription}
            </p>
            <div className="inline-flex items-center gap-3">
              <Link
                to={docsQuickstartPath}
                className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                {isZh ? "查看完整快速开始" : "Read Full Quick Start"}
              </Link>
              <Link
                to={homePath}
                className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition hover:text-foreground"
              >
                {isZh ? "返回首页" : "Back Home"}
              </Link>
            </div>
          </footer>
        </article>
      </div>
    </section>
  );
}

export default StartGuideSection;
