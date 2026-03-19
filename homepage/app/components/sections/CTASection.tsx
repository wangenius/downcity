import type { FC } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { IconArrowRight } from "@tabler/icons-react";

const GITHUB_URL = "https://github.com/wangenius/downcity";

/**
 * 首页收尾 CTA 模块（高级分栏版）。
 * 说明：
 * 1. 左侧强调价值主张，右侧聚焦行动按钮与次要说明。
 * 2. 使用边框分栏保持控制台风格的一致克制感。
 */
export const CTASection: FC = () => {
  const { i18n, t } = useTranslation();
  const isZh = i18n.language === "zh";
  const docsPath = isZh ? "/zh/docs" : "/en/docs";

  return (
    <section className="home-divider py-16 md:py-20">
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
        <div className="home-panel home-reveal rounded-xl">
          <div className="grid gap-6 p-6 md:grid-cols-[1.15fr_0.85fr] md:p-8">
            <div className="space-y-3 md:pr-8 md:border-r md:border-border/70">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Launch Decision
              </p>
              <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                {t("common:ctaSection.titlePrefix")}{" "}
                <span className="italic text-foreground/72">
                  {t("common:ctaSection.titleItalic")}
                </span>
              </h2>
              <p className="max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
                {t("hero:subtitle")}
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <Link
                  to={GITHUB_URL}
                  target="_blank"
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-primary bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {t("common:getStarted")}
                  <IconArrowRight className="size-4" />
                </Link>
                <Link
                  to={docsPath}
                  className="inline-flex h-10 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/65"
                >
                  {t("common:readDocs")}
                </Link>
              </div>

              <p className="text-sm leading-7 text-muted-foreground">
                {isZh
                  ? "建议先用现有仓库跑通最小闭环，再按需接入更多技能与平台。"
                  : "Start with one real repo loop, then layer more skills and channels as needed."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
