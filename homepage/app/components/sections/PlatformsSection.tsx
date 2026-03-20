import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  IconArrowRight,
  IconBrandQq,
  IconBrandTelegram,
  IconMessageDots,
  IconMessageReport,
  IconPuzzle,
} from "@tabler/icons-react";
import { COMMUNITY_LINKS } from "@/lib/community-links";
import { marketingTheme } from "@/lib/marketing-theme";

/**
 * 首页平台能力模块（高级信息板版）。
 * 说明：
 * 1. 平台列表使用“能力表”样式，强调可读性而非卡片堆叠。
 * 2. 扩展路径拆为“提需求”与“自封装”两条清晰行动线。
 */
export function PlatformsSection() {
  const { i18n, t } = useTranslation();
  const lang = i18n.language;
  const skillsPath = lang === "zh" ? "/zh/resources/skills" : "/resources/skills";
  const discussionsUrl = COMMUNITY_LINKS.telegram;
  const panelClass = marketingTheme.panel;
  const kickerClass = marketingTheme.badge;

  const platforms = [
    {
      id: "telegram",
      name: t("platforms:defaultPlatforms.telegram.name"),
      description: t("platforms:defaultPlatforms.telegram.description"),
      icon: IconBrandTelegram,
      status: "native",
    },
    {
      id: "feishu",
      name: t("platforms:defaultPlatforms.feishu.name"),
      description: t("platforms:defaultPlatforms.feishu.description"),
      icon: IconMessageDots,
      status: "native",
    },
    {
      id: "qq",
      name: t("platforms:defaultPlatforms.qq.name"),
      description: t("platforms:defaultPlatforms.qq.description"),
      icon: IconBrandQq,
      status: "native",
    },
  ] as const;

  return (
    <section className="py-16 md:py-20">
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
        <header className="space-y-3">
          <span className={kickerClass}>{t("platforms:title")}</span>
          <p className="max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">
            {t("platforms:subtitle")}
          </p>
        </header>

        <div className={`mt-7 overflow-hidden rounded-xl ${panelClass}`}>
          {platforms.map((platform, index) => (
            <article
              key={platform.id}
              className={`grid gap-2 px-4 py-4 md:grid-cols-[3rem_1fr_auto] md:items-center ${
                index !== platforms.length - 1 ? "border-b border-border/70" : ""
              }`}
            >
              <div className="inline-flex rounded-md border border-border bg-muted/45 p-2 text-muted-foreground">
                <platform.icon className="size-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold">{platform.name}</h3>
                <p className="mt-1 text-sm leading-7 text-muted-foreground">
                  {platform.description}
                </p>
              </div>
              <span className="inline-flex h-6 w-fit items-center rounded-full border border-border bg-background px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {platform.status}
              </span>
            </article>
          ))}
        </div>

        {/* 关键动作区：把“扩展方式”前置为并行决策，缩短用户路径。 */}
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <article className={`rounded-xl p-5 ${panelClass}`}>
            <div className="mb-3 inline-flex rounded-md border border-border bg-muted/45 p-2 text-muted-foreground">
              <IconMessageReport className="size-4" />
            </div>
            <h4 className="text-base font-semibold">{t("platforms:solutions.discuss.title")}</h4>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {t("platforms:solutions.discuss.description")}
            </p>
            <Link
              to={discussionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm text-foreground transition-colors hover:bg-muted/65"
            >
              {t("platforms:solutions.discuss.button")}
              <IconArrowRight className="size-4" />
            </Link>
          </article>

          <article className={`rounded-xl p-5 ${panelClass}`}>
            <div className="mb-3 inline-flex rounded-md border border-border bg-muted/45 p-2 text-muted-foreground">
              <IconPuzzle className="size-4" />
            </div>
            <h4 className="text-base font-semibold">{t("platforms:solutions.skill.title")}</h4>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {t("platforms:solutions.skill.description")}
            </p>
            <Link
              to={skillsPath}
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary bg-primary px-3 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t("platforms:solutions.skill.button")}
              <IconArrowRight className="size-4" />
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}

export default PlatformsSection;
