import { Code, MessageSquare, Play } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";

/**
 * 首页三步上手模块（高级时间线版）。
 * 说明：
 * 1. 用时间线串联动作顺序，替代同质化三卡布局。
 * 2. 每一步都包含命令与结果反馈，形成“输入-输出”闭环。
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
    },
    {
      icon: Play,
      title: t("tutorial:step2.title"),
      description: t("tutorial:step2.description"),
      command: t("tutorial:step2.command"),
      previewTop: t("tutorial:mock.terminal.step2.starting"),
      previewBottom: t("tutorial:mock.terminal.step2.online"),
      type: "terminal",
    },
    {
      icon: MessageSquare,
      title: t("tutorial:step3.title"),
      description: t("tutorial:step3.description"),
      command: t("tutorial:step3.command"),
      previewTop: t("tutorial:step3.command"),
      previewBottom: t("tutorial:agentReply"),
      type: "chat",
    },
  ] as const;

  return (
    <section className="home-divider py-16 md:py-20">
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
        <header className="home-reveal mb-10 flex flex-col gap-3 md:mb-12">
          <span className="home-kicker">{t("tutorial:title")}</span>
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
            {t("tutorial:description")}
          </p>
        </header>

        <div className="home-panel home-reveal home-reveal-delay-1 rounded-xl p-4 md:p-6">
          <ol className="space-y-4">
            {steps.map((step, index) => (
              <li
                key={step.title}
                className="grid gap-3 border-b border-border/70 pb-4 last:border-b-0 last:pb-0 md:grid-cols-[2.6rem_1fr_16rem]"
              >
                <div className="flex items-start gap-2 md:flex-col md:items-center md:gap-1">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/70 font-mono text-[11px] text-muted-foreground">
                    {index + 1}
                  </span>
                  <step.icon className="size-4 text-muted-foreground" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-semibold tracking-tight">{step.title}</h3>
                  <p className="text-sm leading-7 text-muted-foreground">{step.description}</p>
                  <code className="home-command block overflow-x-auto">{step.command}</code>
                </div>

                {/* 关键反馈面板：每一步都给出可观察结果，减少试错成本。 */}
                <div className="rounded-lg border border-border bg-background/85 p-3 text-xs">
                  {step.type === "chat" ? (
                    <div className="space-y-2">
                      <p className="ml-auto w-fit rounded-md border border-border bg-muted px-2 py-1 text-muted-foreground">
                        {step.previewTop}
                      </p>
                      <p className="w-fit rounded-md border border-border bg-background px-2 py-1">
                        {step.previewBottom}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-muted-foreground">{step.previewTop}</p>
                      <p className="mt-1 text-emerald-600 dark:text-emerald-300">
                        {step.previewBottom}
                      </p>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="home-reveal home-reveal-delay-2 mt-8">
          <Link
            to={docsPath}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-primary bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("tutorial:cta")}
          </Link>
        </div>
      </div>
    </section>
  );
}
