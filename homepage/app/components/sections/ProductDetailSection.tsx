import type { FC } from "react";
import { Link } from "react-router";
import { IconArrowRight } from "@tabler/icons-react";

export type ProductDetailContent = {
  title: string;
  subtitle: string;
  docsCtaLabel: string;
  docsCtaHint: string;
  highlights: { title: string; description: string }[];
  scenesTitle: string;
  scenes: string[];
  factsTitle: string;
  facts: string[];
};

type ProductDetailSectionProps = {
  content: ProductDetailContent;
  docsPath: string;
  isZh: boolean;
};

/**
 * 产品子页通用布局（Vibecape 风格）。
 * 说明：
 * 1. 顶部标题、副标题与文档 CTA。
 * 2. 三列 highlights 卡片。
 * 3. 场景列表与事实列表使用细边框面板。
 */
export const ProductDetailSection: FC<ProductDetailSectionProps> = ({ content, docsPath, isZh }) => {
  return (
    <div className="mx-auto max-w-[1320px] px-5 py-16 md:px-8 md:py-24 lg:px-20">
      <div className="space-y-12 md:space-y-16">
        <section className="max-w-3xl space-y-5">
          <h1 className="font-serif text-[clamp(1.875rem,4vw,2.25rem)] font-bold leading-[1.12] tracking-[-0.02em] text-foreground">
            {content.title}
          </h1>
          <p className="text-base leading-[1.65] text-text-soft">{content.subtitle}</p>
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              to={docsPath}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-76"
            >
              {content.docsCtaLabel}
              <IconArrowRight className="size-4" />
            </Link>
            <p className="text-sm text-text-soft">{content.docsCtaHint}</p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-px overflow-hidden rounded-[14px] bg-line md:grid-cols-3">
          {content.highlights.map((item) => (
            <article key={item.title} className="bg-card p-6 transition-colors hover:bg-background md:p-8">
              <h2 className="text-lg font-semibold text-foreground">{item.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-text-soft">{item.description}</p>
            </article>
          ))}
        </section>

        <section className="rounded-[14px] border border-line bg-card p-6 shadow-sm md:p-8">
          <h3 className="text-[0.78rem] font-medium uppercase tracking-[0.04em] text-text-soft">{content.scenesTitle}</h3>
          <ul className="mt-5 space-y-3 text-sm leading-relaxed text-text-soft">
            {content.scenes.map((scene) => (
              <li key={scene} className="flex gap-3">
                <span className="mt-2 inline-flex size-1.5 shrink-0 rounded-full bg-text-subtle" />
                {scene}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-[14px] border border-line bg-card p-6 shadow-sm md:p-8">
          <h3 className="text-[0.78rem] font-medium uppercase tracking-[0.04em] text-text-soft">{content.factsTitle}</h3>
          <ul className="mt-5 space-y-3 text-sm leading-relaxed text-text-soft">
            {content.facts.map((fact) => (
              <li key={fact} className="flex gap-3">
                <span className="mt-2 inline-flex size-1.5 shrink-0 rounded-full bg-text-subtle" />
                {fact}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
};

export default ProductDetailSection;
