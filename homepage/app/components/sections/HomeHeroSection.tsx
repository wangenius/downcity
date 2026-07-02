import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconBrandGithub,
  IconCheck,
  IconCopy,
  IconPlayerPlayFilled,
  IconTerminal2,
  IconCode,
  IconLayoutDashboard,
  IconCommand,
  IconBolt,
  IconCircle,
  IconPoint,
  IconPointFilled,
} from "@tabler/icons-react";
import { marketingTheme } from "@/lib/marketing-theme";
import { cn } from "@/lib/utils";

/**
 * 首页主视觉模块。
 * 说明：
 * 1. 参考 Vibecape 首页“产品演示为核心”的模式，但将演示内容改为 Downcity 的 CLI/SDK/Console。
 * 2. 左侧承担品牌叙事与安装入口，右侧通过可切换的交互式面板展示真实使用路径。
 * 3. 所有文案直接对齐 README 与 quickstart，避免抽象概念失真。
 */

const INSTALL_COMMAND = "npm i -g downcity";

const GITHUB_URL = "https://github.com/wangenius/downcity";

type DemoTab = "cli" | "sdk" | "console";

/**
 * 命令行演示的每一行输出。
 */
interface CliLine {
  prompt: string;
  output: string;
  status?: "ok" | "info" | "muted";
}

const CLI_STEPS: CliLine[] = [
  { prompt: "npm i -g downcity", output: "+ downcity@latest", status: "ok" },
  { prompt: "downcity init", output: "Global config ready at ~/.downcity/", status: "ok" },
  { prompt: "downcity agent create .", output: "Created PROFILE.md, SOUL.md, downcity.json", status: "ok" },
  { prompt: "downcity agent start .", output: "Agent daemon online at 127.0.0.1:15314", status: "ok" },
  { prompt: "downcity agent chat -m \"Summarize this repo\"", output: "This repo is a monorepo for agent infrastructure...", status: "info" },
];

const SDK_SNIPPET = `import { Agent } from "@downcity/agent";
import { createOpenAI } from "@ai-sdk/openai";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const agent = new Agent({
  id: "repo-helper",
  path: "/path/to/project",
});

const session = await agent.session();
await session.set({
  model: openai.responses("gpt-5"),
});

const turn = await session.prompt({
  query: "Summarize the repository structure",
});
const result = await turn.finished;

console.log(result.text);`;

const CONSOLE_ROWS = [
  { label: "Agent", value: "repo-helper", state: "online" },
  { label: "Runtime", value: "daemon", state: "online" },
  { label: "Workspace", value: "repo-native", state: "idle" },
  { label: "City", value: "connected", state: "online" },
  { label: "Last task", value: "summarize repo", state: "idle" },
] as const;

/**
 * 安装命令复制按钮。
 */
function InstallCommand() {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(INSTALL_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "group inline-flex w-full items-center justify-between gap-3 rounded-[14px] border border-line bg-surface px-4 py-3.5",
        "font-mono text-[0.84rem] text-foreground transition-colors hover:border-line-strong hover:bg-surface-hover md:w-auto"
      )}
    >
      <span className="flex items-center gap-3">
        <IconTerminal2 className="size-4 text-text-soft" />
        <span>{INSTALL_COMMAND}</span>
      </span>
      <span
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-[10px] border border-line bg-background transition-colors",
          copied ? "text-success" : "text-text-soft group-hover:text-foreground"
        )}
      >
        {copied ? <IconCheck className="size-3.5" /> : <IconCopy className="size-3.5" />}
      </span>
    </button>
  );
}

/**
 * 单个 CLI 步骤，带打字机效果。
 */
function CliStep({ line, index, activeIndex }: { line: CliLine; index: number; activeIndex: number }) {
  const isVisible = index <= activeIndex;
  const isTyping = index === activeIndex;
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!isTyping) {
      setTyped(isVisible ? line.prompt : "");
      return;
    }
    setTyped("");
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setTyped(line.prompt.slice(0, i));
      if (i >= line.prompt.length) clearInterval(timer);
    }, 28);
    return () => clearInterval(timer);
  }, [isTyping, isVisible, line.prompt]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-1"
    >
      <div className="flex items-start gap-2 font-mono text-[0.78rem]">
        <span className="mt-0.5 shrink-0 text-text-subtle">$</span>
        <span className="text-foreground">
          {typed}
          {isTyping && (
            <motion.span
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 bg-primary align-middle"
            />
          )}
        </span>
      </div>
      <div
        className={cn(
          "pl-4 font-mono text-[0.74rem] leading-5",
          line.status === "ok" && "text-success",
          line.status === "info" && "text-text-soft",
          line.status === "muted" && "text-text-subtle"
        )}
      >
        {line.output}
      </div>
    </motion.div>
  );
}

/**
 * CLI 标签演示面板。
 */
function CliDemo() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (activeIndex >= CLI_STEPS.length - 1) return;
    const timer = setTimeout(() => {
      setActiveIndex((i) => i + 1);
    }, 1600);
    return () => clearTimeout(timer);
  }, [activeIndex]);

  return (
    <div className="space-y-4">
      {CLI_STEPS.map((line, index) => (
        <CliStep key={line.prompt} line={line} index={index} activeIndex={activeIndex} />
      ))}
    </div>
  );
}

/**
 * SDK 代码展示面板。
 */
function SdkDemo() {
  return (
    <div className="relative">
      <pre className="overflow-x-auto font-mono text-[0.74rem] leading-[1.75] text-foreground">
        <code>{SDK_SNIPPET}</code>
      </pre>
    </div>
  );
}

/**
 * Console 状态面板。
 */
function ConsoleDemo() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {CONSOLE_ROWS.slice(0, 4).map((row) => (
          <div
            key={row.label}
            className="rounded-[12px] border border-line bg-surface-muted p-3 transition-colors hover:border-line-strong"
          >
            <div className="flex items-center gap-1.5 text-[0.65rem] uppercase tracking-[0.12em] text-text-subtle">
              {row.state === "online" ? (
                <IconPointFilled className="size-3 text-success" />
              ) : (
                <IconPoint className="size-3 text-text-subtle" />
              )}
              {row.label}
            </div>
            <div className="mt-1.5 text-[0.84rem] font-medium text-foreground">{row.value}</div>
          </div>
        ))}
      </div>
      <div className="rounded-[12px] border border-line bg-surface-muted p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[0.65rem] uppercase tracking-[0.12em] text-text-subtle">Last task</div>
            <div className="mt-1 text-[0.84rem] font-medium text-foreground">{CONSOLE_ROWS[4].value}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 items-center rounded-lg border border-line bg-surface px-2.5 text-[0.7rem] text-text-soft">
              Pause
            </span>
            <span className="inline-flex h-7 items-center rounded-lg border border-line bg-surface px-2.5 text-[0.7rem] text-text-soft">
              Logs
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 右侧演示面板。
 */
function DemoPanel() {
  const [tab, setTab] = useState<DemoTab>("cli");
  const { i18n } = useTranslation();
  const isZh = i18n.language.toLowerCase().startsWith("zh");

  const tabs: { key: DemoTab; label: string; icon: typeof IconTerminal2 }[] = [
    { key: "cli", label: isZh ? "命令行" : "CLI", icon: IconTerminal2 },
    { key: "sdk", label: isZh ? "SDK" : "SDK", icon: IconCode },
    { key: "console", label: isZh ? "控制台" : "Console", icon: IconLayoutDashboard },
  ];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[24px] border border-line bg-surface shadow-[var(--shadow-panel)]",
        "before:pointer-events-none before:absolute before:inset-0 before:rounded-[24px] before:shadow-[inset_0_1px_0_var(--white-alpha-strong)]"
      )}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3 md:px-5">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-danger/80" />
            <span className="size-2.5 rounded-full bg-[#d4a017]/80" />
            <span className="size-2.5 rounded-full bg-success/80" />
          </div>
          <span className="ml-3 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-text-subtle">
            {isZh ? "downcity 演示" : "downcity demo"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[0.72rem] font-medium transition-colors",
                  active
                    ? "bg-surface-strong text-primary-foreground"
                    : "text-text-soft hover:bg-surface-hover hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-[320px] bg-surface-soft/50 p-4 md:min-h-[360px] md:p-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {tab === "cli" && <CliDemo />}
            {tab === "sdk" && <SdkDemo />}
            {tab === "console" && <ConsoleDemo />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * 首页主视觉组件。
 */
export function HomeHeroSection() {
  const { i18n, t } = useTranslation();
  const isZh = i18n.language.toLowerCase().startsWith("zh");
  const startPath = isZh ? "/zh/start" : "/start";
  const docsPath = isZh ? "/zh/docs" : "/en/docs";

  return (
    <section className="relative overflow-hidden border-b border-line-soft">
      <div className="pointer-events-none absolute inset-0 marketing-backdrop-grid opacity-40" />

      <div className="relative mx-auto w-full max-w-7xl px-4 pb-16 pt-10 md:px-6 md:pb-24 md:pt-16 lg:pt-20">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
          {/* 左侧叙事区 */}
          <div className="flex flex-col gap-8 pt-2 lg:pt-8">
            <div className="space-y-6">
              <span className={cn(marketingTheme.badge, "w-fit")}>
                <IconBolt className="size-3.5" />
                {t("hero:topBadge")}
              </span>

              <h1 className="text-balance font-semibold leading-[0.96] tracking-tight text-[clamp(2.5rem,7.2vw,5.2rem)]">
                {t("hero:title")}
                <br />
                <span className="text-foreground/70">{t("hero:titleItalic")}</span>
                {t("hero:titleEnd") ? <> {t("hero:titleEnd")}</> : null}
              </h1>

              <p className="max-w-xl text-pretty text-base leading-7 text-text-soft md:text-lg">
                {t("hero:subtitle")}
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <InstallCommand />
              <div className="flex items-center gap-3">
                <Link
                  to={startPath}
                  className={cn(
                    marketingTheme.primaryButton,
                    "h-12 gap-2 rounded-[14px] px-5 text-[0.92rem]"
                  )}
                >
                  <IconPlayerPlayFilled className="size-3.5" />
                  {t("hero:start")}
                </Link>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    marketingTheme.secondaryButton,
                    "h-12 gap-2 rounded-[14px] px-5 text-[0.92rem]"
                  )}
                >
                  <IconBrandGithub className="size-4" />
                  GitHub
                </a>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.75rem] text-text-subtle">
              <span className="inline-flex items-center gap-1.5">
                <IconCommand className="size-3.5" />
                {isZh ? "CLI + City 管理" : "CLI + City admin"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <IconCode className="size-3.5" />
                {isZh ? "Agent / City / UI SDK" : "Agent / City / UI SDK"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <IconCircle className="size-3.5" />
                {isZh ? "开源 MIT" : "Open source MIT"}
              </span>
            </div>
          </div>

          {/* 右侧演示区 */}
          <DemoPanel />
        </div>
      </div>
    </section>
  );
}

export default HomeHeroSection;
