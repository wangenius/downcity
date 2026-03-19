import type { FC } from "react";
import { Link } from "react-router";
import { IconBrandGithub } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { product } from "@/lib/product";

/**
 * 全站页脚模块（console-ui 风格）。
 * 说明：
 * 1. 采用轻量边框分栏，不使用重背景块。
 * 2. 保留白皮书入口，确保首页与白皮书分流后仍可直达。
 */
export const Footer: FC = () => {
  const currentYear = new Date().getFullYear();
  const { i18n, t } = useTranslation();
  const docsPath = i18n.language === "zh" ? "/zh/docs" : "/en/docs";
  const homePath = i18n.language === "zh" ? "/zh" : "/";
  const featuresPath = i18n.language === "zh" ? "/zh/features" : "/features";
  const whitepaperPath =
    i18n.language === "zh" ? "/zh/whitepaper" : "/whitepaper";

  return (
    <footer className="home-divider py-10 md:py-12">
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Link to={homePath} className="inline-flex items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
                {product.productName}
              </span>
            </Link>
            <p className="mt-3 max-w-md text-sm leading-7 text-muted-foreground">
              {t("hero:subtitle")}
            </p>
            <Link
              to="https://github.com/wangenius/downcity"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <IconBrandGithub size={16} />
              <span>{t("footer.github")}</span>
            </Link>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {t("footer.product")}
            </h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link
                  to={featuresPath}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("footer.features")}
                </Link>
              </li>
              <li>
                <Link
                  to={whitepaperPath}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("nav.whitepaper")}
                </Link>
              </li>
              <li>
                <Link
                  to={docsPath}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("footer.documentation")}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {t("footer.resources")}
            </h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link
                  to="https://github.com/wangenius/downcity/releases"
                  target="_blank"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("footer.releases")}
                </Link>
              </li>
              <li>
                <Link
                  to="https://github.com/wangenius/downcity/issues"
                  target="_blank"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("footer.issues")}
                </Link>
              </li>
              <li>
                <Link
                  to="https://twitter.com/downcity"
                  target="_blank"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("footer.twitter")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-border/70 pt-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>
            {t("footer.copyright", {
              year: currentYear,
              productName: product.productName,
            })}
          </p>
          <p>{t("footer.madeWithIntent")}</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
