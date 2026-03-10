import { Code, MessageSquare, Play } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";

/**
 * 首页三步教程模块。
 * 设计目标：
 * 1. 用高信息密度卡片快速解释上手路径。
 * 2. 在移动端单列展示，在桌面端保持三列清晰节奏。
 * 3. 强化命令可见性，降低首次使用门槛。
 */
export function TutorialSection() {
  const { i18n, t } = useTranslation();
  const docsPath = i18n.language === "zh" ? "/zh/docs" : "/en/docs";

  const steps = [
    {
      icon: Code,
      title: t("tutorial:step1.title"),
      description: t("tutorial:step1.description"),
      command: t("tutorial:step1.command"),
      previewTop: t("tutorial:mock.terminal.step1.initializing"),
      previewBottom: t("tutorial:mock.terminal.step1.ready"),
      type: "terminal",
      tone: "from-amber-500/80 via-orange-400/70 to-rose-400/80",
    },
    {
      icon: Play,
      title: t("tutorial:step2.title"),
      description: t("tutorial:step2.description"),
      command: t("tutorial:step2.command"),
      previewTop: t("tutorial:mock.terminal.step2.starting"),
      previewBottom: t("tutorial:mock.terminal.step2.online"),
      type: "terminal",
      tone: "from-cyan-500/80 via-sky-400/70 to-blue-400/80",
    },
    {
      icon: MessageSquare,
      title: t("tutorial:step3.title"),
      description: t("tutorial:step3.description"),
      command: t("tutorial:step3.command"),
      previewTop: t("tutorial:step3.command"),
      previewBottom: t("tutorial:agentReply"),
      type: "chat",
      tone: "from-emerald-500/80 via-lime-400/70 to-teal-400/80",
    },
  ] as const;

  return (
    <section className="relative overflow-hidden border-y border-border/70 py-16 md:py-24">
      {/* 背景层：轻纹理 + 顶部光带，让教程段落和首屏形成视觉分区 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      </div>

      <div className="mx-auto w-full max-w-4xl px-4 md:px-6">
        <header className="mx-auto mb-12 max-w-3xl text-center md:mb-14">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            {t("tutorial:title")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-base leading-7 text-muted-foreground md:text-lg">
            {t("tutorial:description")}
          </p>
        </header>

        <div className="grid gap-5 lg:grid-cols-3">
          {steps.map((step, index) => (
            <article
              key={step.title}
              className="group relative overflow-hidden rounded-3xl border border-border/70 bg-card/80 p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
            >
              <div
                className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${step.tone}`}
              />

              <div className="mb-4 flex items-center justify-between">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/80 bg-muted font-mono text-xs text-muted-foreground">
                  {index + 1}
                </span>
                <step.icon className="h-5 w-5 text-primary" />
              </div>

              <h3 className="text-xl font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-3 min-h-24 text-sm leading-7 text-muted-foreground md:text-base">
                {step.description}
              </p>

              <code className="mt-4 block overflow-x-auto rounded-xl bg-zinc-950 px-3 py-2 font-mono text-[13px] text-zinc-100">
                {step.command}
              </code>

              {/* 关键反馈面板：让用户在阅读步骤时直接看到执行后的期望输出 */}
              {step.type === "chat" ? (
                <div className="mt-4 space-y-2 rounded-xl border border-border/60 bg-background/90 p-3 text-sm">
                  <div className="ml-auto w-fit rounded-2xl rounded-tr-sm bg-primary px-3 py-1.5 text-primary-foreground">
                    {step.previewTop}
                  </div>
                  <div className="w-fit rounded-2xl rounded-tl-sm bg-muted px-3 py-1.5 text-foreground">
                    {step.previewBottom}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-border/60 bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
                  <p>{step.previewTop}</p>
                  <p className="mt-1 text-emerald-600 dark:text-emerald-400">
                    {step.previewBottom}
                  </p>
                </div>
              )}
            </article>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link
            to={docsPath}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-lg transition hover:-translate-y-0.5 hover:bg-primary/90"
          >
            {t("tutorial:cta")}
          </Link>
        </div>
      </div>
    </section>
  );
}
