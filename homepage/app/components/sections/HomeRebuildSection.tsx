import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import {
  IconArrowRight,
  IconBrandGithub,
  IconCheck,
  IconCopy,
  IconPlayerPlayFilled,
  IconTerminal2,
} from "@tabler/icons-react";

/**
 * 首页核心模块（极简科技版，纯 Tailwind utility）。
 *
 * 设计与信息架构说明：
 * 1. 先给结论：Downcity 解决多项目并行下的上下文污染与管理失控。
 * 2. 再给模型：通过“表层业务 / 底层 Agent 城市”传达品牌隐喻。
 * 3. 最后给路径：把安装到运营闭环清晰呈现为执行路径。
 */
const HOME_CONTENT = {
  zh: {
    badge: "Downcity · Operating System for Agent Cities",
    title: "把多项目运营，压缩成一个可控系统",
    subtitle:
      "你看到的是业务目标；系统底层是被组织起来的 Agent 城市。每个目录是一块独立地块，持续执行、可审计、可回放。",
    metaphorLabel: "核心隐喻",
    metaphorQuote:
      "Downcity 的 IP 不是科幻装饰，而是一个管理隐喻：表层是你的业务，表层之下是被组织起来的 Agent 城市。",
    installCommand: "npm install -g downcity",
    primaryCta: "快速开始",
    secondaryCta: "白皮书",
    docsPath: "/zh/docs/quickstart/getting-started",
    whitepaperPath: "/zh/whitepaper",
    layersTitle: "两层架构，不混线",
    layersSubtitle: "每一层只做一件事：表层定义目标，底层组织执行。",
    layers: [
      {
        name: "表层：业务运营层",
        desc: "你只需要定义客户、业务线和目标节奏。",
        points: ["客户线 / 产品线 / 个人目标分开建目录", "每个目录只表达一个真实目标", "运营侧只看进度与结果，不背工具细节"],
      },
      {
        name: "底层：Agent 城市层",
        desc: "系统在目录边界内调度 Agent、任务与上下文。",
        points: ["目录即上下文边界，默认隔离", "Console 汇总多 Agent 状态与任务", "日志与会话落在仓库，可追责可复盘"],
      },
    ],
    matrixTitle: "Agent City 控制矩阵",
    matrixHeaders: { domain: "域", agent: "Agent", state: "状态", signal: "信号" },
    matrixRows: [
      { domain: "客户A增长", agent: "agent-client-a", state: "online", signal: "任务队列正常" },
      { domain: "AI内容线", agent: "agent-ai-content", state: "online", signal: "素材更新完成" },
      { domain: "健康OKR", agent: "agent-health", state: "idle", signal: "等待下一触发" },
    ],
    routeTitle: "运行路径：从目录到闭环",
    route: [
      { step: "01", title: "安装 Runtime", command: "npm install -g downcity" },
      { step: "02", title: "启动 Console", command: "city console init && city console start" },
      { step: "03", title: "在目录创建 Agent", command: "cd /path/to/repo && city agent create ." },
      { step: "04", title: "进入持续运营", command: "city agent start" },
    ],
    scenariosTitle: "典型入口",
    scenarios: [
      {
        title: "新客户上线",
        desc: "建一个客户目录，拉齐资料，即刻得到一个独立 Agent 工位。",
      },
      {
        title: "双业务并行",
        desc: "金融与 AI 两条线分开跑，节奏互不干扰。",
      },
      {
        title: "老板总控",
        desc: "在一个 Console 里看多项目状态、任务与执行记录。",
      },
    ],
    ctaTitle: "先让一个项目变成你的第一块 Agent 地块",
    ctaDesc: "从最容易串上下文的场景开始，建立目录边界，再建立运营秩序。",
    githubLabel: "GitHub",
    docsLabel: "文档",
  },
  en: {
    badge: "Downcity · Operating System for Agent Cities",
    title: "Compress Multi-Project Operations Into One Controllable System",
    subtitle:
      "What you see is business execution. Underneath is an organized city of agents. Each folder is an independent block for execution, auditability, and replay.",
    metaphorLabel: "Core Metaphor",
    metaphorQuote:
      "Downcity is not sci-fi decoration. It is a management metaphor: business on the surface, an organized city of agents underneath.",
    installCommand: "npm install -g downcity",
    primaryCta: "Get Started",
    secondaryCta: "Whitepaper",
    docsPath: "/en/docs/quickstart/getting-started",
    whitepaperPath: "/whitepaper",
    layersTitle: "Two Layers, No Cross-Talk",
    layersSubtitle: "Each layer has one job: define intent on top, organize execution below.",
    layers: [
      {
        name: "Surface: Business Operations",
        desc: "Define clients, workstreams, and execution cadence.",
        points: [
          "Create separate folders for each client or business lane",
          "One folder should represent one concrete goal",
          "Operators focus on progress and outcomes",
        ],
      },
      {
        name: "Below: Agent City Runtime",
        desc: "The system orchestrates agents, tasks, and context within boundaries.",
        points: [
          "Folder boundaries isolate context by default",
          "Console aggregates multi-agent status and tasks",
          "Logs and sessions stay in repo for replay and accountability",
        ],
      },
    ],
    matrixTitle: "Agent City Control Matrix",
    matrixHeaders: { domain: "Domain", agent: "Agent", state: "State", signal: "Signal" },
    matrixRows: [
      { domain: "Client A Growth", agent: "agent-client-a", state: "online", signal: "Queue healthy" },
      { domain: "AI Content Lane", agent: "agent-ai-content", state: "online", signal: "Material sync done" },
      { domain: "Health OKR", agent: "agent-health", state: "idle", signal: "Waiting next trigger" },
    ],
    routeTitle: "Runtime Path: Folder to Closed Loop",
    route: [
      { step: "01", title: "Install Runtime", command: "npm install -g downcity" },
      { step: "02", title: "Start Console", command: "city console init && city console start" },
      { step: "03", title: "Create Agent In Folder", command: "cd /path/to/repo && city agent create ." },
      { step: "04", title: "Enter Continuous Ops", command: "city agent start" },
    ],
    scenariosTitle: "Entry Scenarios",
    scenarios: [
      {
        title: "New client onboarding",
        desc: "Create one client folder and immediately get one dedicated agent workstation.",
      },
      {
        title: "Parallel business lanes",
        desc: "Run finance and AI lanes independently without context collision.",
      },
      {
        title: "Operator central view",
        desc: "Track project status, tasks, and execution traces from one console.",
      },
    ],
    ctaTitle: "Turn one project into your first agent block",
    ctaDesc: "Start from the lane where context bleed hurts the most. Build boundaries, then build operating order.",
    githubLabel: "GitHub",
    docsLabel: "Docs",
  },
} as const;

/**
 * 首页重建组件。
 * 关键节点（中文）：把用户心智从“工具列表”切到“城市运营模型”。
 */
export function HomeRebuildSection() {
  const { i18n } = useTranslation();
  const [copied, setCopied] = useState(false);
  const isZh = i18n.language.toLowerCase().startsWith("zh");
  const content = isZh ? HOME_CONTENT.zh : HOME_CONTENT.en;

  /** 关键节点（中文）：复制安装命令并即时反馈，降低首步阻力。 */
  const onCopyInstall = () => {
    navigator.clipboard.writeText(content.installCommand);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const stateClass = (state: string) =>
    state === "online"
      ? "border-emerald-300/70 bg-emerald-100/60 text-emerald-700"
      : "border-amber-300/70 bg-amber-100/65 text-amber-700";

  return (
    <div className="relative isolate min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(130%_72%_at_92%_-12%,rgba(86,126,255,0.16),transparent_64%),linear-gradient(to_bottom,rgba(148,163,184,0.16),transparent_26%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(148,163,184,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.14)_1px,transparent_1px)] bg-[size:36px_36px] [mask-image:linear-gradient(to_bottom,black_10%,transparent_84%)]"
      />

      <main className="relative mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-16">
        <section className="rounded-2xl border border-border/75 bg-background/95 p-4 md:p-6 lg:p-8">
          <span className="inline-flex items-center rounded-full border border-border/80 bg-muted/55 px-2.5 py-1 font-mono text-[0.66rem] tracking-[0.11em] text-muted-foreground uppercase">
            {content.badge}
          </span>

          <h1 className="mt-4 max-w-[16ch] text-balance text-[clamp(2.3rem,6.3vw,5.5rem)] leading-[0.94] font-semibold tracking-[-0.034em] text-foreground">
            {content.title}
          </h1>

          <p className="mt-3 max-w-3xl text-pretty text-[clamp(0.95rem,1.35vw,1.08rem)] leading-7 text-muted-foreground">
            {content.subtitle}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onCopyInstall}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border/80 bg-background px-3 font-mono text-sm text-foreground transition hover:-translate-y-0.5 hover:bg-muted/55"
            >
              <IconTerminal2 className="size-4 text-muted-foreground" />
              <span>{content.installCommand}</span>
              {copied ? (
                <IconCheck className="size-4 text-emerald-600" />
              ) : (
                <IconCopy className="size-4 text-muted-foreground" />
              )}
            </button>

            <Link
              to={content.docsPath}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-indigo-500 bg-indigo-600 px-4 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-indigo-700"
            >
              <IconPlayerPlayFilled className="size-3.5" />
              {content.primaryCta}
            </Link>

            <Link
              to={content.whitepaperPath}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border/80 bg-background px-4 text-sm font-medium text-foreground transition hover:-translate-y-0.5 hover:bg-muted/55"
            >
              {content.secondaryCta}
            </Link>
          </div>

          <div className="mt-5 border-t border-border/75 pt-4">
            <p className="font-mono text-[0.67rem] tracking-[0.11em] text-muted-foreground uppercase">
              {content.metaphorLabel}
            </p>
            <p className="mt-2 max-w-4xl text-sm leading-7 text-foreground">{content.metaphorQuote}</p>
          </div>
        </section>

        <section className="mt-8 border-t border-border/75 pt-4">
          <header>
            <h2 className="text-[clamp(1.12rem,2.2vw,1.58rem)] tracking-[-0.014em] text-foreground">
              {content.layersTitle}
            </h2>
            <p className="mt-1 text-sm leading-7 text-muted-foreground">{content.layersSubtitle}</p>
          </header>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {content.layers.map((layer) => (
              <article key={layer.name} className="rounded-xl border border-border/75 bg-background/95 p-4">
                <h3 className="text-[0.96rem] font-semibold text-foreground">{layer.name}</h3>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{layer.desc}</p>
                <ul className="mt-2.5 grid gap-1.5">
                  {layer.points.map((point) => (
                    <li key={point} className="relative pl-4 text-[0.82rem] leading-6 text-muted-foreground">
                      <span className="absolute top-2.5 left-0 size-1.5 rounded-full bg-indigo-500/70" />
                      {point}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8 border-t border-border/75 pt-4">
          <header>
            <h2 className="text-[clamp(1.12rem,2.2vw,1.58rem)] tracking-[-0.014em] text-foreground">
              {content.matrixTitle}
            </h2>
          </header>

          <div className="mt-3 overflow-hidden rounded-xl border border-border/75 bg-background/95">
            <div className="grid grid-cols-2 gap-2 border-b border-border/70 bg-muted/45 px-3 py-2 md:grid-cols-[1.2fr_1.2fr_.75fr_1.3fr]">
              <span className="font-mono text-[0.66rem] tracking-[0.08em] text-muted-foreground uppercase">
                {content.matrixHeaders.domain}
              </span>
              <span className="font-mono text-[0.66rem] tracking-[0.08em] text-muted-foreground uppercase">
                {content.matrixHeaders.agent}
              </span>
              <span className="font-mono text-[0.66rem] tracking-[0.08em] text-muted-foreground uppercase">
                {content.matrixHeaders.state}
              </span>
              <span className="font-mono text-[0.66rem] tracking-[0.08em] text-muted-foreground uppercase">
                {content.matrixHeaders.signal}
              </span>
            </div>

            {content.matrixRows.map((row) => (
              <div
                key={`${row.domain}-${row.agent}`}
                className="grid grid-cols-2 gap-2 border-t border-border/70 px-3 py-2 first:border-t-0 md:grid-cols-[1.2fr_1.2fr_.75fr_1.3fr]"
              >
                <span className="text-[0.82rem] leading-6 text-muted-foreground">{row.domain}</span>
                <span className="font-mono text-[0.76rem] leading-6 text-muted-foreground">{row.agent}</span>
                <span
                  className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 font-mono text-[0.67rem] tracking-[0.06em] uppercase ${stateClass(
                    row.state,
                  )}`}
                >
                  {row.state}
                </span>
                <span className="text-[0.82rem] leading-6 text-muted-foreground">{row.signal}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 border-t border-border/75 pt-4">
          <header>
            <h2 className="text-[clamp(1.12rem,2.2vw,1.58rem)] tracking-[-0.014em] text-foreground">
              {content.routeTitle}
            </h2>
          </header>

          <ol className="mt-3 grid gap-2.5">
            {content.route.map((item) => (
              <li key={item.step} className="grid gap-1.5 md:grid-cols-[auto_minmax(0,1fr)] md:gap-2.5">
                <span className="inline-flex w-fit items-center justify-center rounded-md border border-border/80 bg-muted/55 px-2 py-1 font-mono text-[0.67rem] tracking-[0.08em] text-muted-foreground">
                  {item.step}
                </span>
                <div>
                  <p className="text-sm text-muted-foreground">{item.title}</p>
                  <code className="mt-1 block rounded-md border border-border/75 bg-background px-2.5 py-2 font-mono text-[0.78rem] leading-6 break-words whitespace-pre-wrap text-foreground">
                    {item.command}
                  </code>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-8 border-t border-border/75 pt-4">
          <header>
            <h2 className="text-[clamp(1.12rem,2.2vw,1.58rem)] tracking-[-0.014em] text-foreground">
              {content.scenariosTitle}
            </h2>
          </header>

          <div className="mt-3 grid gap-2.5 md:grid-cols-3">
            {content.scenarios.map((scene) => (
              <article key={scene.title} className="rounded-xl border border-border/75 bg-background/95 p-4">
                <h3 className="text-[0.92rem] font-semibold text-foreground">{scene.title}</h3>
                <p className="mt-1.5 text-[0.84rem] leading-6 text-muted-foreground">{scene.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-3 rounded-2xl border border-border/75 bg-gradient-to-br from-background via-background to-indigo-100/20 p-4 md:grid-cols-[1.15fr_.85fr] md:items-center md:p-5">
          <div>
            <h2 className="text-[clamp(1.16rem,2.5vw,1.84rem)] leading-[1.25] tracking-[-0.012em] text-foreground">
              {content.ctaTitle}
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-7 text-muted-foreground">{content.ctaDesc}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 md:justify-end">
            <a
              href="https://github.com/wangenius/downcity"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-indigo-500 bg-indigo-600 px-4 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-indigo-700"
            >
              <IconBrandGithub className="size-4" />
              {content.githubLabel}
              <IconArrowRight className="size-4" />
            </a>

            <Link
              to={content.docsPath}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border/80 bg-background px-4 text-sm font-medium text-foreground transition hover:-translate-y-0.5 hover:bg-muted/55"
            >
              {content.docsLabel}
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

export default HomeRebuildSection;
