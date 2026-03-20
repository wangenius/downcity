/**
 * 全站营销页面的 Tailwind 语义令牌。
 * 说明：
 * 1. 所有营销页统一使用 muted gray / shadcn 风格的中性底色与深墨正文。
 * 2. 保留细边框与编辑式排版语言，但移除偏黄米色调，让整体更冷静克制。
 * 3. 统一圆角层级：大卡片 24px，内嵌面板 18px，按钮 12px，图标控件 11px。
 */
export const marketingTheme = {
  page: "relative mx-auto w-full max-w-7xl bg-[#FAFAFA]/78 px-4 py-12 md:px-8 md:py-16",
  pageNarrow: "relative mx-auto w-full max-w-6xl bg-[#FAFAFA]/78 px-4 py-12 md:px-8 md:py-16",
  editorialPage: "relative mx-auto w-full max-w-4xl bg-[#FAFAFA]/78 px-4 py-12 md:px-8 md:py-16",
  sectionGap: "space-y-12 md:space-y-16",
  badge:
    "inline-flex items-center gap-2 rounded-full border border-[#E7E7EB] bg-[#F3F4F6] px-3 py-1 text-[0.62rem] uppercase tracking-[0.22em] text-[#6B7280]",
  chip:
    "inline-flex items-center rounded-full border border-[#E7E7EB] bg-[#FAFAFA] px-2.5 py-1 text-[0.58rem] uppercase tracking-[0.18em] text-[#6B7280]",
  eyebrow: "text-[0.62rem] uppercase tracking-[0.22em] text-[#6B7280]",
  heroTitle:
    "font-serif text-[clamp(3.4rem,8vw,6.8rem)] font-black leading-[0.9] tracking-[-0.06em] text-[#111113]",
  pageTitle:
    "font-serif text-[clamp(2.6rem,5.5vw,4.8rem)] font-black leading-[0.94] tracking-[-0.05em] text-[#111113]",
  sectionTitle:
    "font-serif text-[clamp(1.8rem,3vw,2.55rem)] font-black leading-[0.98] tracking-[-0.04em] text-[#111113]",
  lead: "max-w-3xl text-[1rem] leading-8 text-[#6B7280] md:text-[1.05rem]",
  body: "text-sm leading-7 text-[#6B7280] md:text-[0.96rem]",
  panel:
    "rounded-[24px] border border-[#E7E7EB] bg-[#FAFAFA] shadow-[0_1px_0_rgba(17,17,19,0.02)]",
  panelSoft:
    "rounded-[24px] border border-[#E7E7EB] bg-[#F3F4F6]",
  panelInset:
    "rounded-[18px] border border-[#ECECF1] bg-[#F4F5F7]",
  controlSurface:
    "rounded-[12px] border border-[#E7E7EB] bg-[#FAFAFA]",
  rail: "border-l border-[#E7E7EB] pl-4 md:pl-5",
  divider: "border-[#E7E7EB]",
  primaryButton:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] border border-[#111113] bg-[#111113] px-5 text-sm font-medium text-[#FCFCFD] transition-colors hover:bg-[#232326]",
  secondaryButton:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] border border-[#E7E7EB] bg-[#FAFAFA] px-5 text-sm font-medium text-[#111113] transition-colors hover:bg-[#F3F4F6]",
  tertiaryButton:
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[#E7E7EB] bg-transparent px-4 text-sm font-medium text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111113]",
  textButton:
    "inline-flex items-center gap-2 text-sm font-medium text-[#111113] transition-opacity hover:opacity-70",
  code:
    "block overflow-x-auto rounded-[18px] border border-[#E7E7EB] bg-[#F3F4F6] px-4 py-3 font-mono text-[0.78rem] leading-6 text-[#111113]",
  statValue: "font-serif text-[clamp(2rem,4vw,2.8rem)] font-black tracking-[-0.05em] text-[#111113]",
  listDot: "mt-2 inline-flex size-1.5 shrink-0 bg-[#9CA3AF]",
  navShell:
    "rounded-[18px] border border-[#E7E7EB] bg-[#FAFAFA] px-4",
  navItem:
    "inline-flex h-8 items-center border-b border-transparent px-0 text-[0.62rem] uppercase tracking-[0.22em] text-[#6B7280] transition-colors hover:text-[#111113]",
  navItemActive: "border-[#111113] text-[#111113]",
  iconButton:
    "inline-flex size-8 items-center justify-center rounded-[11px] border border-[#E7E7EB] bg-[#FAFAFA] text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111113]",
  filterButton:
    "inline-flex h-9 items-center rounded-full border px-3 text-sm transition-colors",
  filterButtonActive:
    "border-[#DADCE3] bg-[#F3F4F6] text-[#111113]",
  filterButtonIdle:
    "border-[#E7E7EB] bg-[#FAFAFA] text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111113]",
  tag:
    "inline-flex items-center rounded-full border border-[#E7E7EB] bg-[#FAFAFA] px-2.5 py-1 text-[0.72rem] text-[#6B7280]",
  tagSoft:
    "inline-flex items-center rounded-full border border-[#E7E7EB] bg-[#F3F4F6] px-2.5 py-1 text-[0.72rem] text-[#6B7280]",
} as const;

export default marketingTheme;
