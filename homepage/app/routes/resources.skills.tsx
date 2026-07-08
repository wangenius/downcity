import { useTranslation } from "react-i18next";
import { IconExternalLink } from "@tabler/icons-react";
import { product } from "@/lib/product";

export function meta() {
  const title = `${product.productName} — Skills`;
  const description = "Skill directories and plugin resources";
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
  ];
}

const skillDirectories = [
  {
    id: "skillsSh",
    url: "https://skills.sh",
  },
  {
    id: "skillsmp",
    url: "https://skillsmp.com",
  },
  {
    id: "smitherySkills",
    url: "https://smithery.ai/skills",
  },
] as const;

/**
 * Skills 资源页（Vibecape 风格）。
 * 说明：
 * 1. 简洁列表，每个 skill 一项。
 * 2. 使用细线分隔卡片与柔和 hover 反馈。
 */
export default function Skills() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-[1320px] px-5 py-16 md:px-8 md:py-24 lg:px-20">
      <header className="space-y-4">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-text-soft">
          Resources
        </span>
        <h1 className="font-serif text-[clamp(1.875rem,4vw,2.25rem)] font-bold leading-[1.12] tracking-[-0.02em] text-foreground">
          {t("nav.skills")}
        </h1>
        <p className="max-w-2xl text-base leading-[1.65] text-text-soft">{t("resources:skillsPage.subtitle")}</p>
      </header>

      <section className="mt-8 grid gap-px overflow-hidden rounded-[14px] bg-line">
        {skillDirectories.map((item, index) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start justify-between gap-4 bg-card px-5 py-5 transition-colors hover:bg-background md:px-7 md:py-6"
          >
            <div className="grid gap-1">
              <p className="font-mono text-[0.7rem] font-medium uppercase tracking-[0.06em] text-text-subtle">
                {String(index + 1).padStart(2, "0")}
              </p>
              <p className="text-base font-semibold text-foreground">
                {t(`resources:skillsPage.links.${item.id}.title`)}
              </p>
              <p className="text-sm leading-relaxed text-text-soft">
                {t(`resources:skillsPage.links.${item.id}.description`)}
              </p>
              <p className="truncate text-xs text-text-subtle">{item.url}</p>
            </div>
            <IconExternalLink className="mt-1 size-4 shrink-0 text-text-subtle transition-colors group-hover:text-foreground" />
          </a>
        ))}
      </section>
    </div>
  );
}
