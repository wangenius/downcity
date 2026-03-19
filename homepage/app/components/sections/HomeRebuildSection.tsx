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

const HOME_CONTENT = {
  zh: {
    badge: "Downcity · Agent Infra For Operators",
    title: "一个目录一个 Agent，把多项目管理做成可运营系统",
    subtitle:
      "当你同时跑多个客户、业务线或个人目标，一个通用助手很容易串上下文。Downcity 用目录边界切分 Agent，再用 Console 统一管理。",
    installCommand: "npm install -g downcity",
    primaryCta: "快速开始",
    secondaryCta: "白皮书",
    docsPath: "/zh/docs/quickstart/getting-started",
    whitepaperPath: "/zh/whitepaper",
    facts: [
      { label: "核心边界", value: "目录/仓库 = 一个 Agent 上下文" },
      { label: "管理方式", value: "一个 Console 查看全部 Agent 状态与任务" },
      { label: "协作入口", value: "Telegram · 飞书（Feishu/Lark） · QQ" },
    ],
    storyTitle: "Downcity 的 IP 叙事（管理视角）",
    storyParagraphs: [
      "Downcity 的 IP 不是科幻装饰，而是一个管理隐喻：表层是你的业务，表层之下是被组织起来的 Agent 城市。",
      "每个目录是一块独立工位，资料、脚本、决策和产出都留在本地块，项目之间互不污染。",
      "你对外只需一句话派工；系统内部完成分工、执行、回传和沉淀。",
    ],
    featureTitle: "为什么这套方式有效",
    features: [
      {
        title: "目录即边界，不再串台",
        desc: "健康管理、创业研究、客户项目可以各有各的 Agent，上下文互不干扰。",
        signal: "Context Isolation",
      },
      {
        title: "老板视角的一体化管控",
        desc: "同一控制台看多个 Agent 在干什么、哪些任务在跑、哪里卡住。",
        signal: "All-in-One Console",
      },
      {
        title: "按业务分工，不按提示词硬拼",
        desc: "每个 Agent 对应一个真实目标，权限、资料和角色天然匹配。",
        signal: "Role-based Workspace",
      },
      {
        title: "交接与复盘更顺",
        desc: "新成员进来先看目录与历史产出，不用从零口头同步。",
        signal: "Handover Ready",
      },
    ],
    sceneTitle: "真实场景切入（来自你的使用方式）",
    scenes: [
      {
        title: "新客户进来，马上开工",
        setup: "接到新客户需求，你先建一个客户目录并拉入全部物料。",
        action: "一键创建该目录专属 Agent，让它在本目录持续服务。",
        outcome: "客户上下文完整沉淀，后续需求不需要每次重讲。",
        map: "一客户一目录一Agent",
      },
      {
        title: "双业务线并行运营",
        setup: "你同时做金融与 AI 两条内容线，背景和节奏完全不同。",
        action: "建立两个目录、两个 Agent，各自产出与迭代。",
        outcome: "两条业务线不互相污染，运营节奏更稳定。",
        map: "多业务并行",
      },
      {
        title: "个人 OKR 分区管理",
        setup: "你要同时推进健康、学习、创业三类目标。",
        action: "为每类目标分配独立 Agent，按场景维护任务与提醒。",
        outcome: "同一个助手不会混乱，计划执行更可控。",
        map: "目标分区管理",
      },
      {
        title: "老板一屏总控",
        setup: "你手上有多个项目、多个 Agent 同时在线。",
        action: "在 Console 一屏查看状态、任务与执行记录。",
        outcome: "不用逐个打开窗口，管理成本显著下降。",
        map: "老板视角总览",
      },
    ],
    startTitle: "进入 Downcity：4 步",
    start: [
      { title: "安装", command: "npm install -g downcity" },
      {
        title: "初始化并启动 Console（首次）",
        command: "city console init && city console start",
      },
      {
        title: "初始化仓库 Agent",
        command: "cd /path/to/your-repo && city agent create .",
      },
      { title: "启动 Agent", command: "city agent start" },
    ],
    startHint: "可选：city console ui start",
    ctaTitle: "先把一个正在并行的项目，变成独立 Agent 工位",
    ctaDesc: "从你最容易串上下文的场景开始，今天就建第一个目录级 Agent。",
    githubLabel: "GitHub",
    docsLabel: "文档",
  },
  en: {
    badge: "Downcity · Agent Infra For Operators",
    title: "One Folder, One Agent: Operate Multi-Project Work Without Context Chaos",
    subtitle:
      "When you run multiple clients, business lines, or personal goals at once, a single general assistant often mixes context. Downcity isolates agents by folder and manages them in one console.",
    installCommand: "npm install -g downcity",
    primaryCta: "Get Started",
    secondaryCta: "Whitepaper",
    docsPath: "/en/docs/quickstart/getting-started",
    whitepaperPath: "/whitepaper",
    facts: [
      { label: "Core Boundary", value: "Folder/Repo = One Agent Context" },
      { label: "Operating Model", value: "One Console for Status and Tasks Across Agents" },
      { label: "Collaboration Channels", value: "Telegram · Feishu (Lark) · QQ" },
    ],
    storyTitle: "The Downcity Story (Operator Lens)",
    storyParagraphs: [
      "Downcity's IP is not decorative sci-fi. It is an operating metaphor: your business on the surface, an organized city of agents beneath it.",
      "Each folder is a dedicated workstation where materials, scripts, decisions, and outputs stay local to that domain.",
      "You dispatch with one sentence; the system handles routing, execution, return, and retention.",
    ],
    featureTitle: "Why This Model Works",
    features: [
      {
        title: "Folder boundary prevents context bleed",
        desc: "Health planning, startup research, and client operations can run in separate agents without cross-noise.",
        signal: "Context Isolation",
      },
      {
        title: "All-in-one operator view",
        desc: "Track what each agent is doing, which tasks are running, and where things are blocked.",
        signal: "All-in-One Console",
      },
      {
        title: "Role-based setup over prompt patching",
        desc: "Each agent maps to a real business goal with aligned scope, materials, and responsibilities.",
        signal: "Role-based Workspace",
      },
      {
        title: "Faster handover and review",
        desc: "New teammates start from folder history and outputs instead of verbal replay.",
        signal: "Handover Ready",
      },
    ],
    sceneTitle: "Real Scenario Entry",
    scenes: [
      {
        title: "New client, immediate operation",
        setup: "A new client arrives and you create a dedicated folder for all materials.",
        action: "Spin up a folder-specific agent and keep operations inside that boundary.",
        outcome: "Client context stays complete and future requests need less re-briefing.",
        map: "One client, one folder, one agent",
      },
      {
        title: "Two business lines in parallel",
        setup: "You operate both finance and AI content lines with very different context.",
        action: "Create two folders and two agents, each with its own output cycle.",
        outcome: "No context collision across lines and a steadier operating rhythm.",
        map: "Parallel business lanes",
      },
      {
        title: "Personal OKR domain split",
        setup: "You are pushing health, learning, and startup goals at the same time.",
        action: "Assign one agent per goal domain and keep reminders/tasks scoped.",
        outcome: "Execution becomes more controllable without assistant confusion.",
        map: "Goal-domain management",
      },
      {
        title: "Boss-level central control",
        setup: "Multiple projects and agents are running simultaneously.",
        action: "Use Console to inspect status, tasks, and execution traces in one place.",
        outcome: "You avoid tab hopping and reduce management overhead.",
        map: "Operator control view",
      },
    ],
    startTitle: "Enter Downcity in 4 Steps",
    start: [
      { title: "Install", command: "npm install -g downcity" },
      {
        title: "Initialize and start Console (first run)",
        command: "city console init && city console start",
      },
      {
        title: "Initialize agent in your repository",
        command: "cd /path/to/your-repo && city agent create .",
      },
      { title: "Start agent runtime", command: "city agent start" },
    ],
    startHint: "Optional: city console ui start",
    ctaTitle: "Turn one parallel project into an independent agent workstation",
    ctaDesc: "Start with the scenario where context mix hurts you most, and create your first folder-level agent today.",
    githubLabel: "GitHub",
    docsLabel: "Docs",
  },
} as const;

/**
 * 首页重建模块（IP 叙事 + 场景切入版）。
 *
 * 关键点（中文）：
 * 1. 用“目录即边界”的心智解释 Downcity，不再抽象泛化。
 * 2. feature 与场景直接来自真实使用方式（多项目并行、老板总控、上下文隔离）。
 * 3. 文案保持用户语言，避免开发实现细节堆叠。
 */
export function HomeRebuildSection() {
  const { i18n } = useTranslation();
  const [copied, setCopied] = useState(false);
  const isZh = i18n.language.toLowerCase().startsWith("zh");
  const content = isZh ? HOME_CONTENT.zh : HOME_CONTENT.en;
  const sceneLabels = isZh
    ? { setup: "背景", action: "动作", outcome: "结果" }
    : { setup: "Setup", action: "Action", outcome: "Outcome" };
  const panelTitle = isZh ? "运营控制面板" : "Operator Control Plane";
  const panelHint = isZh
    ? "一个目录一个 Agent，边界清晰，状态可追踪。"
    : "One folder, one agent. Clear boundaries, trackable status.";
  const panelRows = isZh
    ? [
        { label: "Runtime", value: "online", state: "ok" },
        { label: "Context", value: "isolated by folder", state: "ok" },
        { label: "Control", value: "console-first", state: "idle" },
      ]
    : [
        { label: "Runtime", value: "online", state: "ok" },
        { label: "Context", value: "isolated by folder", state: "ok" },
        { label: "Control", value: "console-first", state: "idle" },
      ];

  /** 关键节点（中文）：复制安装命令并给到即时反馈，降低首步阻力。 */
  const onCopyInstall = () => {
    navigator.clipboard.writeText(content.installCommand);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="home-min min-h-screen">
      <main className="home-min-main mx-auto w-full max-w-6xl px-4 py-8 md:px-6 md:py-14">
        <section className="home-min-hero home-min-fade">
          <div className="home-min-hero-grid">
            <div className="home-min-hero-copy">
              <span className="home-min-badge">{content.badge}</span>
              <h1 className="home-min-title">{content.title}</h1>
              <p className="home-min-subtitle">{content.subtitle}</p>

              <div className="home-min-actions">
                <button type="button" onClick={onCopyInstall} className="home-min-command">
                  <IconTerminal2 className="size-4 text-muted-foreground" />
                  <span>{content.installCommand}</span>
                  {copied ? (
                    <IconCheck className="size-4 text-emerald-600" />
                  ) : (
                    <IconCopy className="size-4 text-muted-foreground" />
                  )}
                </button>

                <Link to={content.docsPath} className="home-min-button home-min-button--primary">
                  <IconPlayerPlayFilled className="size-3.5" />
                  {content.primaryCta}
                </Link>

                <Link to={content.whitepaperPath} className="home-min-button">
                  {content.secondaryCta}
                </Link>
              </div>

              <ul className="home-min-facts" aria-label="facts">
                {content.facts.map((item) => (
                  <li key={item.label} className="home-min-fact-item">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </li>
                ))}
              </ul>
            </div>

            <aside className="home-min-hero-panel home-min-fade home-min-fade-delay-1">
              <p className="home-min-panel-eyebrow">{panelTitle}</p>
              <p className="home-min-panel-note">{panelHint}</p>

              <div className="home-min-panel-states">
                {panelRows.map((row) => (
                  <div key={row.label} className="home-min-panel-row">
                    <span className="home-min-panel-key">{row.label}</span>
                    <span className="home-min-panel-value">
                      <span
                        className={`home-min-panel-dot ${row.state === "ok" ? "is-ok" : "is-idle"}`}
                      />
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              <ol className="home-min-panel-steps">
                {content.start.slice(0, 3).map((item, index) => (
                  <li key={item.title}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <p>{item.title}</p>
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        </section>

        <section className="home-min-section home-min-story home-min-fade home-min-fade-delay-1">
          <header className="home-min-section-head">
            <h2>{content.storyTitle}</h2>
          </header>
          <div className="home-min-story-copy">
            {content.storyParagraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </section>

        <section className="home-min-section home-min-fade home-min-fade-delay-2">
          <header className="home-min-section-head">
            <h2>{content.featureTitle}</h2>
          </header>
          <div className="home-min-value-grid">
            {content.features.map((feature) => (
              <article key={feature.title} className="home-min-value-item">
                <h3>{feature.title}</h3>
                <p>{feature.desc}</p>
                <span>{feature.signal}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="home-min-section home-min-fade home-min-fade-delay-2">
          <header className="home-min-section-head">
            <h2>{content.sceneTitle}</h2>
          </header>
          <div className="home-min-scene-grid">
            {content.scenes.map((scene) => (
              <article key={scene.title} className="home-min-scene-item">
                <h3>{scene.title}</h3>
                <p className="home-min-scene-line">
                  <span className="home-min-scene-label">{sceneLabels.setup}</span>
                  {scene.setup}
                </p>
                <p className="home-min-scene-line">
                  <span className="home-min-scene-label">{sceneLabels.action}</span>
                  {scene.action}
                </p>
                <p className="home-min-scene-line">
                  <span className="home-min-scene-label">{sceneLabels.outcome}</span>
                  {scene.outcome}
                </p>
                <span className="home-min-scene-map">{scene.map}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="home-min-section home-min-fade home-min-fade-delay-2">
          <header className="home-min-section-head">
            <h2>{content.startTitle}</h2>
          </header>
          <ol className="home-min-start-list">
            {content.start.map((item, index) => (
              <li key={`${item.title}-${index}`} className="home-min-start-item">
                <span className="home-min-start-index">{String(index + 1).padStart(2, "0")}</span>
                <div className="home-min-start-copy">
                  <p>{item.title}</p>
                  <code>{item.command}</code>
                </div>
              </li>
            ))}
          </ol>
          <p className="home-min-start-hint">{content.startHint}</p>
        </section>

        <section className="home-min-section home-min-cta home-min-fade home-min-fade-delay-3">
          <div>
            <h2>{content.ctaTitle}</h2>
            <p>{content.ctaDesc}</p>
          </div>
          <div className="home-min-actions">
            <a
              href="https://github.com/wangenius/downcity"
              target="_blank"
              rel="noreferrer"
              className="home-min-button home-min-button--primary"
            >
              <IconBrandGithub className="size-4" />
              {content.githubLabel}
              <IconArrowRight className="size-4" />
            </a>
            <Link to={content.docsPath} className="home-min-button">
              {content.docsLabel}
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

export default HomeRebuildSection;
