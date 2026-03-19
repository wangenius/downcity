import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { marketingTheme } from "@/lib/marketing-theme";

const statsKeys = ["fast", "simple", "anytime", "anywhere"] as const;

/**
 * 统计模块。
 * 说明：
 * 1. 把四个核心指标收敛进一个整体面板，而不是四张互相竞争的卡片。
 * 2. 让数字承担节奏，标签与说明只做支撑。
 */
export const StatsSection: FC = () => {
  const { t } = useTranslation();

  return (
    <section className={marketingTheme.pageNarrow}>
      <div className={`${marketingTheme.panel} overflow-hidden`}>
        <div className="grid gap-0 md:grid-cols-2 xl:grid-cols-4">
          {statsKeys.map((key, index) => (
            <article
              key={key}
              className="border-b border-border/68 px-5 py-5 last:border-b-0 md:px-6 md:py-6 xl:border-b-0 xl:border-r xl:last:border-r-0"
            >
              <p className={marketingTheme.eyebrow}>Stat {String(index + 1).padStart(2, "0")}</p>
              <p className={`mt-3 ${marketingTheme.statValue}`}>{t(`stats:${key}.value`)}</p>
              <p className="mt-1 text-[0.72rem] uppercase tracking-[0.12em] text-muted-foreground">
                {t(`stats:${key}.label`)}
              </p>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{t(`stats:${key}.description`)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default StatsSection;
