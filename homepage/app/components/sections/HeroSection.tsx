import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  IconCheck,
  IconCopy,
  IconSparkles,
  IconTerminal2,
} from "@tabler/icons-react";

const INSTALL_COMMAND = "npm i -g shipmyagent";

/**
 * 首页首屏模块。
 * 设计目标：
 * 1. 左侧聚焦价值表达与核心行动。
 * 2. 右侧展示“仓库即 Agent”的运行流程感。
 * 3. 在移动端保持单列可读性，在桌面端形成强对比布局。
 */
export function HeroSection() {
  const { i18n, t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const docsPath = i18n.language === "zh" ? "/zh/docs" : "/en/docs";

  const copyCommand = () => {
    navigator.clipboard.writeText(INSTALL_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const flowPreview = [
    { label: t("tutorial:step1.title"), command: t("tutorial:step1.command") },
    { label: t("tutorial:step2.title"), command: t("tutorial:step2.command") },
    { label: t("tutorial:step3.title"), command: t("tutorial:step3.command") },
  ];

  return (
    <section className="relative overflow-hidden py-16 md:py-24 lg:py-28">
      {/* 关键背景层：用渐变光斑和网格纹理强化首页识别度 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="homepage-orb homepage-orb--one" />
        <div className="homepage-orb homepage-orb--two" />
        <div className="homepage-grid-mask" />
      </div>

      <div className="container mx-auto px-4 md:px-6">
        <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
          <div className="space-y-8">
            <Badge
              variant="outline"
              className="rounded-full border-primary/30 bg-background/80 px-4 py-1 text-xs tracking-wide backdrop-blur"
            >
              {t("hero:topBadge")}
            </Badge>

            <div className="space-y-5">
              <h1 className="text-balance text-4xl leading-[1.05] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
                <span className="font-serif">{t("hero:title")}</span>{" "}
                <span className="font-serif italic text-primary">
                  {t("hero:titleItalic")}
                </span>{" "}
                <span className="font-serif">{t("hero:titleEnd")}</span>
              </h1>
              <p className="max-w-2xl text-pretty text-base leading-7 text-muted-foreground md:text-lg">
                {t("hero:subtitle")}
              </p>
            </div>

            {/* 关键交互：复制命令为首要动作，文档入口为次要动作 */}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                className="group h-11 gap-3 rounded-xl border-border/70 bg-card/90 px-4 font-mono text-sm shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                onClick={copyCommand}
              >
                <IconTerminal2 className="h-4 w-4 text-muted-foreground" />
                <span>{INSTALL_COMMAND}</span>
                <span className="ml-1 flex items-center border-l border-border pl-3">
                  {copied ? (
                    <IconCheck className="h-4 w-4 text-green-500" />
                  ) : (
                    <IconCopy className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                  )}
                </span>
              </Button>

              <Link
                to={docsPath}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:-translate-y-0.5 hover:bg-primary/90"
              >
                {t("tutorial:cta")}
              </Link>
            </div>

            <div className="flex flex-wrap gap-2">
              {[t("hero:tag1"), t("hero:tag2"), t("hero:tag3")].map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="rounded-full px-3 py-1 text-xs"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="homepage-float rounded-3xl border border-border/70 bg-card/85 shadow-xl backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {t("hero:verticalText")}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  <IconSparkles className="h-3.5 w-3.5" />
                  {t("tutorial:mock.chat.status")}
                </span>
              </div>

              <div className="space-y-4 p-5">
                {flowPreview.map((step, index) => (
                  <div
                    key={step.label}
                    className="rounded-2xl border border-border/60 bg-background/80 p-4 transition hover:border-primary/35 hover:shadow-sm"
                  >
                    <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/80 bg-muted font-mono text-[11px]">
                        {index + 1}
                      </span>
                      {step.label}
                    </div>
                    <code className="block overflow-x-auto rounded-lg bg-zinc-950/95 px-3 py-2 font-mono text-[13px] text-zinc-100">
                      {step.command}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
