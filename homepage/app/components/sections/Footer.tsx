import type { FC } from "react";
import { Link } from "react-router";
import { IconBrandGithub, IconBrandX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { product } from "@/lib/product";
import { marketingTheme } from "@/lib/marketing-theme";

/**
 * 全站页脚模块。
 * 说明：
 * 1. Footer 继续去信息，只保留品牌、文档入口、社交出口和版权信息。
 * 2. 让页面收尾像一条安静的系统边界，而不是第二个导航区。
 */
export const Footer: FC = () => {
  const currentYear = new Date().getFullYear();
  const { i18n, t } = useTranslation();
  const isZh = i18n.language.toLowerCase().startsWith("zh");
  const docsPath = isZh ? "/zh/docs" : "/en/docs";
  const homePath = isZh ? "/zh" : "/";
  const twitterUrl = "https://x.com/downcity_ai";
  const githubUrl = "https://github.com/wangenius/downcity";

  return (
    <footer className="px-3 pb-6 pt-8 md:px-5 md:pb-10 md:pt-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 border-t border-[#ECECF1] pt-5 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <Link to={homePath} className="inline-flex items-center gap-3">
            <img src="/icon-192.png" alt="Downcity" className="block h-10 w-10 object-contain opacity-95" />
            <span>
              <span className="block text-[0.92rem] font-medium tracking-[-0.05em] text-foreground">
                {product.productName}
              </span>
              <span className="block font-mono text-[0.56rem] uppercase tracking-[0.2em] text-foreground/40">
                Business Above / Agents Below
              </span>
            </span>
          </Link>
          <p className="max-w-xl text-sm leading-7 text-foreground/56">{t("hero:subtitle")}</p>
        </div>

        <div className="flex flex-col items-start gap-4 md:items-end">
          <div className="flex items-center gap-3">
            <Link to={docsPath} className={marketingTheme.navItem}>
              {t("footer.documentation")}
            </Link>
            <a
              href={twitterUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={marketingTheme.iconButton}
              aria-label="Twitter"
            >
              <IconBrandX className="size-4" />
            </a>
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={marketingTheme.iconButton}
              aria-label={t("footer.github")}
            >
              <IconBrandGithub className="size-4" />
            </a>
          </div>
          <p className="text-[0.64rem] uppercase tracking-[0.16em] text-foreground/40">
            {t("footer.copyright", {
              year: currentYear,
              productName: product.productName,
            })}
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
