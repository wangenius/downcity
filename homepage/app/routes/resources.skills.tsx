import { useTranslation } from "react-i18next";
import { product } from "@/lib/product";
import { marketingTheme } from "@/lib/marketing-theme";

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

export default function Skills() {
  const { t } = useTranslation();

  return (
    <div className={marketingTheme.pageNarrow}>
      <header className="space-y-3">
        <span className={marketingTheme.badge}>
          Resources
        </span>
        <h1 className={marketingTheme.pageTitle}>{t("nav.skills")}</h1>
        <p className={marketingTheme.lead}>
          {t("resources:skillsPage.subtitle")}
        </p>
      </header>

      <section className={`${marketingTheme.panel} mt-8 p-6`}>
        <h2 className="text-lg font-semibold">{t("resources:skillsPage.sections.skills")}</h2>
        <ul className="mt-4 space-y-3">
          {skillDirectories.map((item, index) => (
            <li key={item.id}>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`block ${marketingTheme.panelSoft} px-4 py-3 transition-colors hover:bg-background/90`}
              >
                <p className={marketingTheme.eyebrow}>
                  Directory {index + 1}
                </p>
                <p className="mt-1 text-sm font-semibold">{t(`resources:skillsPage.links.${item.id}.title`)}</p>
                <p className="mt-1 text-sm leading-7 text-muted-foreground">
                  {t(`resources:skillsPage.links.${item.id}.description`)}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{item.url}</p>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
