/**
 * 全站营销页面的 Tailwind 语义令牌。
 * 说明：
 * 1. 参考 Vibecape 的温暖极简风格，使用暖石白底、近黑正文、细线分隔。
 * 2. 标题字号克制有力，卡片以 1px 细线分隔，hover 反馈柔和。
 * 3. 圆角层级：小控件 6px，按钮 8px，卡片 14px，大型 mockup 20px。
 */
export const marketingTheme = {
  page: "relative mx-auto w-full max-w-[1600px] px-5 md:px-8 lg:px-20",
  pageNarrow: "relative mx-auto w-full max-w-[1320px] px-5 md:px-8 lg:px-20",
  editorialPage: "relative mx-auto w-full max-w-4xl px-5 md:px-8 lg:px-20",
  sectionGap: "space-y-24 md:space-y-32",
  section: "py-20 md:py-28",
  badge:
    "inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-text-soft",
  chip:
    "inline-flex items-center rounded-full border border-line bg-surface px-2.5 py-1 text-[0.58rem] font-medium uppercase tracking-[0.12em] text-text-soft",
  eyebrow: "text-[0.78rem] font-medium uppercase tracking-[0.04em] text-text-soft",
  heroTitle:
    "font-serif text-[clamp(2.125rem,5vw,3.375rem)] font-bold leading-[1.04] tracking-[-0.02em] text-foreground",
  pageTitle:
    "font-serif text-[clamp(1.875rem,4vw,2.25rem)] font-bold leading-[1.12] tracking-[-0.02em] text-foreground",
  sectionTitle:
    "font-serif text-[clamp(1.625rem,3vw,2.25rem)] font-bold leading-[1.12] tracking-[-0.02em] text-foreground",
  lead: "max-w-2xl text-base leading-[1.65] text-text-soft",
  body: "text-sm leading-[1.65] text-text-soft",
  panel:
    "rounded-[14px] border border-line bg-card shadow-sm",
  panelSoft:
    "rounded-[14px] border border-line bg-surface-soft",
  panelInset:
    "rounded-[12px] border border-line-soft bg-surface-muted",
  controlSurface:
    "rounded-lg border border-line bg-surface",
  rail: "border-l border-line pl-4 md:pl-5",
  divider: "border-line",
  primaryButton:
    "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-76",
  secondaryButton:
    "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-foreground/[0.05] px-5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.08]",
  tertiaryButton:
    "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-transparent px-4 text-sm font-medium text-text-soft transition-colors hover:bg-surface-hover hover:text-foreground",
  textButton:
    "inline-flex items-center gap-2 text-sm font-medium text-foreground transition-opacity hover:opacity-70",
  code:
    "block overflow-x-auto rounded-xl border border-line bg-surface-soft px-4 py-3 font-mono text-[0.78rem] leading-6 text-foreground",
  statValue: "font-serif text-[2.5rem] font-bold tracking-[-0.02em] text-foreground",
  listDot: "mt-2 inline-flex size-1.5 shrink-0 bg-text-subtle",
  navShell:
    "rounded-lg border border-line bg-surface px-4",
  navItem:
    "inline-flex h-8 items-center rounded-md px-3 text-[0.8125rem] font-medium text-text-soft transition-colors hover:bg-foreground/[0.04] hover:text-foreground",
  navItemActive: "bg-foreground/[0.04] text-foreground",
  iconButton:
    "inline-flex size-8 items-center justify-center rounded-md text-text-soft transition-colors hover:bg-foreground/[0.04] hover:text-foreground",
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
