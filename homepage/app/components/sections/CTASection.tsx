import type { FC } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { IconArrowRight } from "@tabler/icons-react";
import { marketingTheme } from "@/lib/marketing-theme";

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
    <section className="border-t border-border/68 py-14 md:py-16">
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-3">
            <p className={marketingTheme.eyebrow}>Launch Decision</p>
            <h2 className="font-serif text-[1.9rem] font-semibold tracking-[-0.04em] text-foreground md:text-[2.25rem]">
              {t("common:ctaSection.titlePrefix")}{" "}
              <span className="italic text-foreground/72">{t("common:ctaSection.titleItalic")}</span>
            </h2>
            <p className="max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
              {isZh
                ? "先在一个真实仓库里跑通最小闭环，再按需加更多技能与平台。"
                : "Close one real repo loop first, then add more skills and platforms only when needed."}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link to={GITHUB_URL} target="_blank" className={marketingTheme.secondaryButton}>
              {t("common:getStarted")}
              <IconArrowRight className="size-4" />
            </Link>
            <Link to={docsPath} className={marketingTheme.primaryButton}>
              {t("common:readDocs")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
