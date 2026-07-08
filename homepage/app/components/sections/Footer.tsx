import type { FC } from "react";
import { Link } from "react-router";
import { IconBrandGithub, IconBrandX, IconArrowUpRight } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { product } from "@/lib/product";
import { COMMUNITY_LINKS } from "@/lib/community-links";

/**
 * 全站页脚模块（Vibecape 风格）。
 * 说明：
 * 1. 两栏布局：左侧品牌与版权，右侧联系与导航链接。
 * 2. 链接卡片使用 1px 细线分隔，hover 箭头微移。
 * 3. 保持简洁低信息密度，作为页面收尾。
 */
export const Footer: FC = () => {
  const currentYear = new Date().getFullYear();
  const { i18n, t } = useTranslation();
  const isZh = i18n.language.toLowerCase().startsWith("zh");
  const docsPath = isZh ? "/zh/docs" : "/en/docs";
  const homePath = isZh ? "/zh" : "/";
  const termsPath = "/terms";
  const privacyPath = "/privacy";
  const twitterUrl = "https://x.com/downcity_ai";
  const githubUrl = "https://github.com/wangenius/downcity";
  const telegramUrl = COMMUNITY_LINKS.telegram;

  const contactLinks = [
    { label: "X", value: "x.com/downcity_ai", href: twitterUrl },
    { label: "GitHub", value: "github.com/wangenius/downcity", href: githubUrl },
    { label: "Telegram", value: "t.me/downcity", href: telegramUrl },
    { label: t("footer.documentation"), value: isZh ? "downcity.ai/zh/docs" : "downcity.ai/en/docs", href: docsPath },
  ] as const;

  return (
    <footer className="border-t border-line bg-background">
      <div className="mx-auto grid max-w-[1600px] gap-12 px-5 py-16 md:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-20 lg:py-24">
        <div className="space-y-5">
          <Link to={homePath} className="inline-flex items-center gap-2.5">
            <img src="/icon.svg" alt="Downcity" className="brand-logo block h-6 w-6 object-contain" />
            <span className="text-[0.9375rem] font-semibold text-foreground">{product.productName}</span>
          </Link>
          <p className="max-w-sm text-sm leading-relaxed text-text-soft">{t("hero:subtitle")}</p>
          <p className="text-xs text-text-subtle">
            © {currentYear} {product.productName}. {t("footer.madeWithIntent")}
          </p>
        </div>

        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
            <span className="font-mono text-[0.7rem] font-medium uppercase tracking-[0.08em] text-text-subtle">
              {t("common:contact")}
            </span>
            <div className="flex items-center gap-4">
              <Link to={termsPath} className="font-mono text-[0.7rem] font-medium uppercase tracking-[0.08em] text-text-subtle transition-colors hover:text-foreground">
                {t("footer.terms")}
              </Link>
              <Link to={privacyPath} className="font-mono text-[0.7rem] font-medium uppercase tracking-[0.08em] text-text-subtle transition-colors hover:text-foreground">
                {t("footer.privacy")}
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[14px] bg-line sm:grid-cols-2">
            {contactLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target={link.href.startsWith("/") ? undefined : "_blank"}
                rel={link.href.startsWith("/") ? undefined : "noopener noreferrer"}
                className="group flex items-center justify-between gap-4 bg-background p-5 transition-colors hover:bg-card"
              >
                <div className="grid gap-1">
                  <span className="text-sm font-semibold text-foreground">{link.label}</span>
                  <span className="font-mono text-[0.72rem] text-text-subtle">{link.value}</span>
                </div>
                <IconArrowUpRight className="size-4 text-text-subtle transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
