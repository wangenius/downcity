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
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 首页平台能力模块。
 * 设计目标：
 * 1. 清晰传达当前支持的平台能力。
 * 2. 给出“扩展平台”的两条明确路径。
 * 3. 保持 CTA 层级，帮助用户快速进入讨论或文档。
 */
export function PlatformsSection() {
  const { i18n, t } = useTranslation();
  const lang = i18n.language;
  const skillsPath =
    lang === "zh" ? "/zh/resources/skills" : "/resources/skills";
  const discussionsUrl = "https://github.com/wangenius/shipmyagent/discussions";

  const platforms = [
    {
      id: "telegram",
      name: t("platforms:defaultPlatforms.telegram.name"),
      description: t("platforms:defaultPlatforms.telegram.description"),
      icon: IconBrandTelegram,
      color: "text-sky-500",
      surface: "from-sky-500/20 to-sky-500/5",
    },
    {
      id: "feishu",
      name: t("platforms:defaultPlatforms.feishu.name"),
      description: t("platforms:defaultPlatforms.feishu.description"),
      icon: IconMessageDots,
      color: "text-blue-600",
      surface: "from-blue-600/20 to-blue-600/5",
    },
    {
      id: "qq",
      name: t("platforms:defaultPlatforms.qq.name"),
      description: t("platforms:defaultPlatforms.qq.description"),
      icon: IconBrandQq,
      color: "text-cyan-500",
      surface: "from-cyan-500/20 to-cyan-500/5",
    },
  ] as const;

  return (
    <section className="relative overflow-hidden py-16 md:py-24">
      {/* 背景层：细微渐变与网格纹理，避免区块显得扁平 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background" />
        <div className="homepage-grid-mask opacity-40" />
      </div>

      <div className="container mx-auto px-4 md:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            {t("platforms:title")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-base leading-7 text-muted-foreground md:text-lg">
            {t("platforms:subtitle")}
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {platforms.map((platform) => (
            <article
              key={platform.id}
              className="group relative overflow-hidden rounded-3xl border border-border/70 bg-card/85 p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
            >
              <div
                className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${platform.surface}`}
              />
              <div
                className={`mb-5 inline-flex rounded-2xl border border-border/70 bg-background/80 p-3 ${platform.color}`}
              >
                <platform.icon className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-semibold tracking-tight">{platform.name}</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground md:text-base">
                {platform.description}
              </p>
            </article>
          ))}
        </div>

        {/* 关键决策区：引导用户选择“提需求”或“自己封装” */}
        <div className="mt-12 rounded-3xl border border-border/70 bg-card/80 p-6 shadow-sm md:p-8">
          <div className="mb-8 text-center">
            <h3 className="text-2xl font-semibold tracking-tight md:text-3xl">
              {t("platforms:otherTitle")}
            </h3>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
              {t("platforms:otherSubtitle")}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-border/70 bg-background/85 p-5">
              <div className="mb-4 inline-flex rounded-xl bg-orange-500/10 p-2 text-orange-500">
                <IconMessageReport className="h-6 w-6" />
              </div>
              <h4 className="text-lg font-semibold">
                {t("platforms:solutions.discuss.title")}
              </h4>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {t("platforms:solutions.discuss.description")}
              </p>
              <Link
                to={discussionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "mt-5 inline-flex items-center gap-2 rounded-xl",
                )}
              >
                {t("platforms:solutions.discuss.button")}
                <IconArrowRight className="h-4 w-4" />
              </Link>
            </article>

            <article className="rounded-2xl border border-border/70 bg-background/85 p-5">
              <div className="mb-4 inline-flex rounded-xl bg-primary/10 p-2 text-primary">
                <IconPuzzle className="h-6 w-6" />
              </div>
              <h4 className="text-lg font-semibold">
                {t("platforms:solutions.skill.title")}
              </h4>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {t("platforms:solutions.skill.description")}
              </p>
              <Link
                to={skillsPath}
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "mt-5 inline-flex items-center gap-2 rounded-xl",
                )}
              >
                {t("platforms:solutions.skill.button")}
                <IconArrowRight className="h-4 w-4" />
              </Link>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}

export default PlatformsSection;
