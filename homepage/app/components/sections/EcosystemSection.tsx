import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { marketingTheme } from "@/lib/marketing-theme";

/**
 * 生态模块。
 * 说明：
 * 1. 三组生态能力在同一结构面板里展开，阅读路径更稳定。
 * 2. 列表只表达兼容范围，不做额外装饰。
 */
export const EcosystemSection: FC = () => {
  const { t } = useTranslation();

  const columns = [
    { id: "models", title: t("ecosystem:categories.models.title") },
    { id: "protocols", title: t("ecosystem:categories.protocols.title") },
    { id: "tools", title: t("ecosystem:categories.tools.title") },
  ] as const;

  return (
    <section className={marketingTheme.pageNarrow}>
      <header className="space-y-4">
        <span className={marketingTheme.badge}>Ecosystem</span>
        <h2 className={marketingTheme.pageTitle}>{t("ecosystem:title")}</h2>
        <p className={marketingTheme.lead}>{t("ecosystem:description")}</p>
      </header>

      <div className={`${marketingTheme.panel} mt-8 grid overflow-hidden md:grid-cols-3`}>
        {columns.map((column, index) => (
          <article
            key={column.id}
            className={index !== columns.length - 1 ? "border-b border-border/68 px-5 py-5 md:border-b-0 md:border-r md:px-6" : "px-5 py-5 md:px-6"}
          >
            <h3 className={marketingTheme.eyebrow}>{column.title}</h3>
            <ul className="mt-4 space-y-2.5 text-sm leading-7 text-foreground/90">
              {(t(`ecosystem:categories.${column.id}.items`, { returnObjects: true }) as string[]).map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className={marketingTheme.listDot} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
};

export default EcosystemSection;
