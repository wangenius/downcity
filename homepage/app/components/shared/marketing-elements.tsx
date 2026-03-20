/**
 * 营销页共享元素模块。
 * 说明：
 * 1. 把按钮、卡片、筛选按钮与标签收束成同一套可复用外壳，避免各页面继续散写圆角和边框。
 * 2. 这里只负责营销页视觉一致性，不承载业务逻辑。
 */
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";
import { marketingTheme } from "@/lib/marketing-theme";

/**
 * 营销卡片容器。
 * 说明：
 * 1. 默认使用主卡片面板。
 * 2. `tone="soft"` 时用于次级信息块，保持同一圆角层级。
 */
export function MarketingPanel({
  tone = "default",
  className,
  ...props
}: ComponentPropsWithoutRef<"div"> & {
  tone?: "default" | "soft" | "inset";
}) {
  const toneClass =
    tone === "soft"
      ? marketingTheme.panelSoft
      : tone === "inset"
        ? marketingTheme.panelInset
        : marketingTheme.panel;

  return <div className={cn(toneClass, className)} {...props} />;
}

/**
 * 营销按钮样式生成器。
 * 说明：
 * 1. 统一营销页 CTA 的高度、圆角和边框。
 * 2. `ghost` 适合筛选与次级动作，不与主按钮抢层级。
 */
export function marketingButtonClass(options?: {
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  const variant = options?.variant ?? "primary";

  return cn(
    variant === "primary"
      ? marketingTheme.primaryButton
      : variant === "secondary"
        ? marketingTheme.secondaryButton
        : marketingTheme.tertiaryButton,
    options?.className,
  );
}

/**
 * 营销筛选按钮样式生成器。
 * 说明：
 * 1. 所有 FAQ / tab / filter 一律走同一圆角与边框语言。
 * 2. 激活态只提升前景与底色，不引入额外装饰。
 */
export function marketingFilterButtonClass(options?: {
  active?: boolean;
  className?: string;
}) {
  return cn(
    marketingTheme.filterButton,
    options?.active ? marketingTheme.filterButtonActive : marketingTheme.filterButtonIdle,
    options?.className,
  );
}

/**
 * 营销标签样式生成器。
 * 说明：
 * 1. 统一技术栈、元信息与辅助状态的轻量标签。
 * 2. `soft` 用于卡片内部弱层级标签。
 */
export function marketingTagClass(options?: {
  tone?: "default" | "soft";
  className?: string;
}) {
  return cn(
    options?.tone === "soft" ? marketingTheme.tagSoft : marketingTheme.tag,
    options?.className,
  );
}
