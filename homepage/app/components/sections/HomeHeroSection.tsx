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
  IconBook,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

/**
 * 首页主视觉模块（Vibecape 风格）。
 * 说明：
 * 1. 左侧为标题、副标题与行动按钮，下方为大型 App Mockup。
 * 2. Mockup 模拟 Downcity 的真实使用路径：CLI / SDK / Console。
 * 3. 配色、字体、圆角与阴影统一使用新的温暖极简 token。
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
        "group inline-flex w-full items-center justify-between gap-4 rounded-lg border border-line bg-surface px-4 py-3",
        "font-mono text-[0.82rem] text-foreground transition-colors hover:border-line-strong hover:bg-surface-hover sm:w-auto"
      )}
    >
      <span className="flex items-center gap-3">
        <IconTerminal2 className="size-4 text-text-subtle" />
        <span>{INSTALL_COMMAND}</span>
      </span>
      <span
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-md border border-line bg-card transition-colors",
          copied ? "text-success" : "text-text-subtle group-hover:text-foreground"
        )}
      >
        {copied ? <IconCheck className="size-3.5" /> : <IconCopy className="size-3.5" />}
      </span>
    </button>
  );
}

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
      <div className={cn("pl-4 font-mono text-[0.74rem] leading-5", line.status === "ok" ? "text-success" : "text-text-soft")}>
        {line.output}
      </div>
    </motion.div>
  );
}

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

function SdkDemo() {
  return (
    <pre className="overflow-x-auto font-mono text-[0.74rem] leading-[1.75] text-foreground">
      <code>{SDK_SNIPPET}</code>
    </pre>
  );
}

function ConsoleDemo() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {CONSOLE_ROWS.map((row) => (
        <div
          key={row.label}
          className="rounded-xl border border-line bg-surface-muted p-3 transition-colors hover:border-line-strong"
        >
          <div className="flex items-center gap-1.5 text-[0.65rem] uppercase tracking-[0.1em] text-text-subtle">
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
    <div
      className="relative overflow-hidden rounded-[20px] border border-line bg-card shadow-[0_1px_2px_rgb(27_27_24_/_0.03),_0_4px_8px_rgb(27_27_24_/_0.03),_0_12px_24px_rgb(27_27_24_/_0.04),_0_32px_64px_rgb(27_27_24_/_0.05)]"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </div>
          <span className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-text-subtle">downcity</span>
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
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[0.75rem] font-medium transition-colors",
                  active ? "bg-foreground text-background" : "text-text-subtle hover:bg-surface-hover hover:text-foreground"
                )}
              >
                <Icon className="size-3" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-[280px] bg-surface-soft/40 p-4 md:min-h-[320px] md:p-5">
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

export function HomeHeroSection() {
  const { i18n, t } = useTranslation();
  const isZh = i18n.language.toLowerCase().startsWith("zh");
  const startPath = isZh ? "/zh/start" : "/start";
  const docsPath = isZh ? "/zh/docs" : "/en/docs";

  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-[1600px] px-5 pb-16 pt-16 md:px-8 md:pb-24 md:pt-24 lg:px-20">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-text-soft">
            <IconBolt className="size-3" />
            {t("hero:topBadge")}
          </span>

          <h1 className="mt-6 font-serif text-[clamp(2rem,5vw,3.375rem)] font-bold leading-[1.04] tracking-[-0.02em] text-foreground">
            {t("hero:title")}
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-[1.65] text-text-soft">
            {t("hero:subtitle")}
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <InstallCommand />
            <Link
              to={startPath}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-76"
            >
              <IconPlayerPlayFilled className="size-3.5" />
              {t("hero:start")}
            </Link>
            <Link
              to={docsPath}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-foreground/[0.05] px-5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.08]"
            >
              <IconBook className="size-3.5" />
              {isZh ? "查看文档" : "Read docs"}
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-14 max-w-5xl md:mt-20">
          <DemoPanel />
        </div>
      </div>
    </section>
  );
}

export default HomeHeroSection;
