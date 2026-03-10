import type { FC } from "react";
import { useTranslation } from "react-i18next";
import {
  IconTools,
  IconBuildingStore,
  IconCloud,
} from "@tabler/icons-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const resources = [
  {
    titleKey: "resources:skills.title",
    descriptionKey: "resources:skills.description",
    icon: IconTools,
    path: "/skills",
  },
  {
    titleKey: "resources:marketplace.title",
    descriptionKey: "resources:marketplace.description",
    icon: IconBuildingStore,
    path: "/marketplace",
  },
  {
    titleKey: "resources:hosting.title",
    descriptionKey: "resources:hosting.description",
    icon: IconCloud,
    path: "/hosting",
  },
];

export const ResourcesSection: FC = () => {
  const { i18n, t } = useTranslation();
  const basePath = i18n.language === "zh" ? "/zh/resources" : "/resources";

  return (
    <section className="py-12 md:py-24 lg:py-32">
      <div className="mx-auto w-full max-w-4xl px-4 md:px-6">
        <div className="flex flex-col items-center justify-center space-y-4 text-center">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tighter md:text-4xl/tight">
              {t("resources:title")}
            </h2>
            <p className="text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              {t("resources:subtitle")}
            </p>
          </div>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-2">
          {resources.map((item, i) => (
            <a key={i} href={`${basePath}${item.path}`} className="block group">
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardHeader>
                  <item.icon className="h-10 w-10 mb-2 text-primary group-hover:scale-110 transition-transform duration-200" />
                  <CardTitle>{t(item.titleKey as any)}</CardTitle>
                  <CardDescription>
                    {t(item.descriptionKey as any)}
                  </CardDescription>
                </CardHeader>
              </Card>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ResourcesSection;
