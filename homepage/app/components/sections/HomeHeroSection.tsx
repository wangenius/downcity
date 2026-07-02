import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconCheck,
  IconCopy,
  IconPlayerPlayFilled,
  IconTerminal2,
  IconCode,
  IconLayoutDashboard,
  IconBolt,
  IconPoint,
  IconPointFilled,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

/**
 * 首页主视觉模块（极简版）。
 * 说明：
 * 1. 全局 Header 由 root Layout 提供，本组件不再重复渲染导航。
 * 2. 页面只保留核心文案、安装入口与产品演示。
 * 3. 参考 Vibecape 首页的克制排版：大量留白、细边框、小字号标签、真实界面模拟。
 * 4. 演示面板展示 Downcity 的真实使用路径：CLI / SDK / Console。
 */

const INSTALL_COMMAND = "npm i -g downcity";

type DemoTab = "cli" | "sdk" | "console";

interface CliLine {
  prompt: string;
  output: string;
  status?: "ok" | "info";
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
        "group inline-flex w-full items-center justify-between gap-4 rounded-xl border border-line bg-surface px-4 py-3.5",
        "font-mono text-[0.84rem] text-foreground transition-colors hover:border-line-strong hover:bg-surface-hover sm:w-auto"
      )}
    >
      <span className="flex items-center gap-3">
        <IconTerminal2 className="size-4 text-text-subtle" />
        <span>{INSTALL_COMMAND}</span>
      </span>
      <span
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-lg border border-line bg-background transition-colors",
          copied ? "text-success" : "text-text-subtle group-hover:text-foreground"
        )}
      >
        {copied ? <IconCheck className="size-3.5" /> : <IconCopy className="size-3.5" />}
      </span>
    </button>
  );
}

/**
 * CLI 单步骤打字机效果。
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
          line.status === "ok" ? "text-success" : "text-text-soft"
        )}
      >
        {line.output}
      </div>
    </motion.div>
  );
}

/**
 * CLI 演示面板。
 */
function CliDemo() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (activeIndex >= CLI_STEPS.length - 1) return;
    const timer = setTimeout(() => setActiveIndex((i) => i + 1), 1600);
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
    <pre className="overflow-x-auto font-mono text-[0.74rem] leading-[1.75] text-foreground">
      <code>{SDK_SNIPPET}</code>
    </pre>
  );
}

/**
 * Console 状态面板。
 */
function ConsoleDemo() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {CONSOLE_ROWS.map((row) => (
        <div
          key={row.label}
          className="rounded-xl border border-line bg-surface-muted p-3 transition-colors hover:border-line-strong"
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
    { key: "sdk", label: "SDK", icon: IconCode },
    { key: "console", label: isZh ? "控制台" : "Console", icon: IconLayoutDashboard },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-panel)]">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-danger/80" />
            <span className="size-2.5 rounded-full bg-[#d4a017]/80" />
            <span className="size-2.5 rounded-full bg-success/80" />
          </div>
          <span className="ml-2 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-text-subtle">
            {isZh ? "downcity" : "downcity"}
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
                  "inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[0.7rem] font-medium transition-colors",
                  active
                    ? "bg-foreground text-background"
                    : "text-text-subtle hover:bg-surface-hover hover:text-foreground"
                )}
              >
                <Icon className="size-3" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-[280px] bg-surface-soft/40 p-4 md:min-h-[300px] md:p-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
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
 * 说明：顶部内边距为全局 Navbar 留出空间，避免内容被遮挡。
 */
export function HomeHeroSection() {
  const { i18n, t } = useTranslation();
  const isZh = i18n.language.toLowerCase().startsWith("zh");
  const startPath = isZh ? "/zh/start" : "/start";
  const docsPath = isZh ? "/zh/docs" : "/en/docs";

  return (
    <section className="relative">
      <div className="mx-auto max-w-5xl px-4 pb-24 pt-24 md:px-6 md:pb-32 md:pt-32">
        <div className="flex flex-col items-center text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-text-subtle">
            <IconBolt className="size-3" />
            {t("hero:topBadge")}
          </span>

          <h1 className="mt-7 max-w-3xl text-balance text-[clamp(2.5rem,7vw,5rem)] font-semibold leading-[0.98] tracking-tight">
            {t("hero:title")}{" "}
            <span className="text-foreground/70">{t("hero:titleItalic")}</span>
            {t("hero:titleEnd") ? <> {t("hero:titleEnd")}</> : null}
          </h1>

          <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-text-soft md:text-lg">
            {t("hero:subtitle")}
          </p>

          <div className="relative z-10 mt-8 flex flex-col items-center gap-3 sm:flex-row">
            <InstallCommand />
            <Link
              to={startPath}
              className="inline-flex h-[3.25rem] items-center gap-2 rounded-xl border border-foreground bg-foreground px-5 text-[0.9rem] font-medium text-background transition-colors hover:bg-foreground/90"
            >
              <IconPlayerPlayFilled className="size-3.5" />
              {t("hero:start")}
            </Link>
            <Link
              to={docsPath}
              className="inline-flex h-[3.25rem] items-center rounded-xl border border-line bg-surface px-5 text-[0.9rem] font-medium text-foreground transition-colors hover:bg-surface-hover"
            >
              {isZh ? "查看文档" : "Read docs"}
            </Link>
          </div>
        </div>

        <div className="relative z-10 mt-14 md:mt-20">
          <DemoPanel />
        </div>
      </div>
    </section>
  );
}

export default HomeHeroSection;
