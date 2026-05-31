/**
 * 全站营销页面的 Tailwind 语义令牌。
 * 说明：
 * 1. 所有营销页统一使用 muted gray / shadcn 风格的中性底色与深墨正文。
 * 2. 保留细边框与编辑式排版语言，但移除偏黄米色调，让整体更冷静克制。
 * 3. 统一圆角层级：大卡片 24px，内嵌面板 18px，按钮 12px，图标控件 11px。
 */
export const marketingTheme = {
  page: "relative mx-auto w-full max-w-7xl bg-surface/78 px-4 py-12 md:px-8 md:py-16",
  pageNarrow: "relative mx-auto w-full max-w-6xl bg-surface/78 px-4 py-12 md:px-8 md:py-16",
  editorialPage: "relative mx-auto w-full max-w-4xl bg-surface/78 px-4 py-12 md:px-8 md:py-16",
  sectionGap: "space-y-12 md:space-y-16",
  badge:
    "inline-flex items-center gap-2 rounded-full border border-line bg-surface-soft px-3 py-1 text-[0.62rem] uppercase tracking-[0.22em] text-text-soft",
  chip:
    "inline-flex items-center rounded-full border border-line bg-surface px-2.5 py-1 text-[0.58rem] uppercase tracking-[0.18em] text-text-soft",
  eyebrow: "text-[0.62rem] uppercase tracking-[0.22em] text-text-soft",
  heroTitle:
    "font-serif text-[clamp(3.4rem,8vw,6.8rem)] font-black leading-[0.9] tracking-[-0.06em] text-foreground",
  pageTitle:
    "font-serif text-[clamp(2.6rem,5.5vw,4.8rem)] font-black leading-[0.94] tracking-[-0.05em] text-foreground",
  sectionTitle:
    "font-serif text-[clamp(1.8rem,3vw,2.55rem)] font-black leading-[0.98] tracking-[-0.04em] text-foreground",
  lead: "max-w-3xl text-[1rem] leading-8 text-text-soft md:text-[1.05rem]",
  body: "text-sm leading-7 text-text-soft md:text-[0.96rem]",
  panel:
    "rounded-[24px] border border-line bg-surface shadow-[var(--shadow-panel)]",
  panelSoft:
    "rounded-[24px] border border-line bg-surface-soft",
  panelInset:
    "rounded-[18px] border border-line-soft bg-surface-muted",
  controlSurface:
    "rounded-[12px] border border-line bg-surface",
  rail: "border-l border-line pl-4 md:pl-5",
  divider: "border-line",
  primaryButton:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] border border-primary bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-surface-strong hover:text-primary-foreground",
  secondaryButton:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] border border-line bg-surface px-5 text-sm font-medium text-foreground transition-colors hover:bg-surface-soft",
  tertiaryButton:
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-line bg-transparent px-4 text-sm font-medium text-text-soft transition-colors hover:bg-surface-soft hover:text-foreground",
  textButton:
    "inline-flex items-center gap-2 text-sm font-medium text-foreground transition-opacity hover:opacity-70",
  code:
    "block overflow-x-auto rounded-[18px] border border-line bg-surface-soft px-4 py-3 font-mono text-[0.78rem] leading-6 text-foreground",
  statValue: "font-serif text-[clamp(2rem,4vw,2.8rem)] font-black tracking-[-0.05em] text-foreground",
  listDot: "mt-2 inline-flex size-1.5 shrink-0 bg-text-subtle",
  navShell:
    "rounded-[18px] border border-line bg-surface px-4",
  navItem:
    "inline-flex h-8 items-center border-b border-transparent px-0 text-[0.62rem] uppercase tracking-[0.22em] text-text-soft transition-colors hover:text-foreground",
  navItemActive: "border-primary text-foreground",
  iconButton:
    "inline-flex size-8 items-center justify-center rounded-[11px] border border-line bg-surface text-text-soft transition-colors hover:bg-surface-soft hover:text-foreground",
  filterButton:
    "inline-flex h-9 items-center rounded-full border px-3 text-sm transition-colors",
  filterButtonActive:
    "border-line-strong bg-surface-soft text-foreground",
  filterButtonIdle:
    "border-line bg-surface text-text-soft hover:bg-surface-soft hover:text-foreground",
  tag:
    "inline-flex items-center rounded-full border border-line bg-surface px-2.5 py-1 text-[0.72rem] text-text-soft",
  tagSoft:
    "inline-flex items-center rounded-full border border-line bg-surface-soft px-2.5 py-1 text-[0.72rem] text-text-soft",
} as const;

export default marketingTheme;
