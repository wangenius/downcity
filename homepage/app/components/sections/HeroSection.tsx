import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import {
  IconArrowUpRight,
  IconCheck,
  IconCopy,
  IconPlayerPlayFilled,
  IconSparkles,
  IconTerminal2,
} from "@tabler/icons-react";

const INSTALL_COMMAND = "npm i -g downcity";

/**
 * 首页首屏模块（高级重构版）。
 * 说明：
 * 1. 采用“叙事区 + 控制平面”非对称布局，强化品牌记忆点。
 * 2. 将安装命令、文档入口与治理能力放在同一视线链路中。
 * 3. 右侧用运行时状态柱模拟 console-ui 的控制台质感。
 */
export function HeroSection() {
  const { i18n, t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const isZh = i18n.language === "zh";
  const docsPath = isZh ? "/zh/docs" : "/en/docs";

  const copyCommand = () => {
    navigator.clipboard.writeText(INSTALL_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const governanceItems = isZh
    ? [
        "边界由你定义，Agent 只在边界内执行",
        "关键操作可审批，过程全链路可追踪",
        "状态留在仓库，不被平台绑架",
      ]
    : [
        "You define boundaries, agents execute inside them.",
        "Sensitive actions stay reviewable and traceable.",
        "State remains in your repo, not locked in a platform.",
      ];

  const runtimeRows = [
    { label: "Runtime", value: "online", state: "ok" },
    { label: "Workspace", value: "repo-native", state: "idle" },
    { label: "Control", value: "human-in-loop", state: "idle" },
  ] as const;

  return (
    <section className="border-b border-border/80 py-16 md:py-20 lg:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
        <div className="home-grid-lines grid items-start gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-8 pr-0 lg:pr-8">
            <div className="home-reveal">
              <span className="home-kicker">
                <IconSparkles className="size-3.5" />
                {t("hero:topBadge")}
              </span>
            </div>

            <div className="home-reveal home-reveal-delay-1 space-y-5">
              <h1 className="text-balance font-semibold leading-[0.94] tracking-tight text-[clamp(2.6rem,8.2vw,6.1rem)]">
                {t("hero:title")}
                <br />
                <span className="italic text-foreground/68">{t("hero:titleItalic")}</span>
                {t("hero:titleEnd") ? <> {t("hero:titleEnd")}</> : null}
              </h1>
              <p className="max-w-2xl text-pretty text-base leading-7 text-muted-foreground md:text-lg">
                {t("hero:subtitle")}
              </p>
            </div>

            <div className="home-reveal home-reveal-delay-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={copyCommand}
                className="home-panel inline-flex h-11 items-center gap-3 rounded-lg px-3.5 font-mono text-sm text-foreground transition-colors hover:bg-muted/65"
              >
                <IconTerminal2 className="size-4 text-muted-foreground" />
                <span>{INSTALL_COMMAND}</span>
                <span className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background">
                  {copied ? (
                    <IconCheck className="size-4 text-emerald-600" />
                  ) : (
                    <IconCopy className="size-4 text-muted-foreground" />
                  )}
                </span>
              </button>

              <Link
                to={docsPath}
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-primary bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <IconPlayerPlayFilled className="size-3.5" />
                {t("tutorial:cta")}
              </Link>
            </div>

            <div className="home-reveal home-reveal-delay-3 grid gap-2.5">
              {governanceItems.map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-2.5 border-l border-border/80 pl-3 text-sm text-muted-foreground"
                >
                  <span className="mt-1 inline-flex size-1.5 shrink-0 rounded-full bg-foreground/55" />
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </div>

          <aside className="home-reveal home-reveal-delay-2 home-panel overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                Control Plane
              </p>
              <Link
                to={docsPath}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:bg-muted/65 hover:text-foreground"
              >
                Docs
                <IconArrowUpRight className="size-3" />
              </Link>
            </div>

            <div className="grid gap-4 p-4">
              <div className="space-y-2.5">
                {runtimeRows.map((row) => (
                  <div
                    key={row.label}
                    className="grid grid-cols-[7rem_minmax(0,1fr)] items-center rounded-lg border border-border/75 bg-background/85 px-3 py-2"
                  >
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {row.label}
                    </span>
                    <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-foreground">
                      <span
                        className={`inline-flex h-1.5 w-1.5 rounded-full ${
                          row.state === "ok" ? "bg-emerald-500" : "bg-muted-foreground/65"
                        }`}
                      />
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="home-command">
                  <p className="text-muted-foreground">$ city agent create .</p>
                  <p className="mt-1 text-emerald-600 dark:text-emerald-300">
                    {t("tutorial:mock.terminal.step1.ready")}
                  </p>
                </div>
                <div className="home-command">
                  <p className="text-muted-foreground">$ city agent start</p>
                  <p className="mt-1 text-emerald-600 dark:text-emerald-300">
                    {t("tutorial:mock.terminal.step2.online")}
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
