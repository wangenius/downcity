/**
 * 全站营销页面的 Tailwind 语义令牌。
 * 说明：
 * 1. 所有营销页统一使用 muted gray / shadcn 风格的中性底色与深墨正文。
 * 2. 保留细边框与编辑式排版语言，但移除偏黄米色调，让整体更冷静克制。
 */
export const marketingTheme = {
  page: "mx-auto w-full max-w-7xl px-4 py-12 md:px-8 md:py-16",
  pageNarrow: "mx-auto w-full max-w-6xl px-4 py-12 md:px-8 md:py-16",
  editorialPage: "mx-auto w-full max-w-4xl px-4 py-12 md:px-8 md:py-16",
  sectionGap: "space-y-12 md:space-y-16",
  badge:
    "inline-flex items-center gap-2 border border-[#E4E4E7] bg-[#F4F4F5] px-3 py-1 text-[0.62rem] uppercase tracking-[0.22em] text-[#71717A]",
  chip:
    "inline-flex items-center border border-[#E4E4E7] bg-[#FAFAFA] px-2.5 py-1 text-[0.58rem] uppercase tracking-[0.18em] text-[#71717A]",
  eyebrow: "text-[0.62rem] uppercase tracking-[0.22em] text-[#71717A]",
  heroTitle:
    "font-serif text-[clamp(3.4rem,8vw,6.8rem)] font-black leading-[0.9] tracking-[-0.06em] text-[#18181B]",
  pageTitle:
    "font-serif text-[clamp(2.6rem,5.5vw,4.8rem)] font-black leading-[0.94] tracking-[-0.05em] text-[#18181B]",
  sectionTitle:
    "font-serif text-[clamp(1.8rem,3vw,2.55rem)] font-black leading-[0.98] tracking-[-0.04em] text-[#18181B]",
  lead: "max-w-3xl text-[1rem] leading-8 text-[#71717A] md:text-[1.05rem]",
  body: "text-sm leading-7 text-[#71717A] md:text-[0.96rem]",
  panel:
    "border border-[#E4E4E7] bg-[#FAFAFA]",
  panelSoft:
    "border border-[#E4E4E7] bg-[#F4F4F5]",
  rail: "border-l border-[#E4E4E7] pl-4 md:pl-5",
  divider: "border-[#E4E4E7]",
  primaryButton:
    "inline-flex min-h-11 items-center justify-center gap-2 border border-[#18181B] bg-[#18181B] px-5 text-sm font-medium text-[#FAFAFA] transition-colors hover:bg-[#27272A]",
  secondaryButton:
    "inline-flex min-h-11 items-center justify-center gap-2 border border-[#E4E4E7] bg-[#FAFAFA] px-5 text-sm font-medium text-[#18181B] transition-colors hover:bg-[#F4F4F5]",
  tertiaryButton:
    "inline-flex min-h-10 items-center justify-center gap-2 border border-[#E4E4E7] bg-transparent px-4 text-sm font-medium text-[#71717A] transition-colors hover:bg-[#F4F4F5] hover:text-[#18181B]",
  textButton:
    "inline-flex items-center gap-2 text-sm font-medium text-[#18181B] transition-opacity hover:opacity-70",
  code:
    "block overflow-x-auto border border-[#E4E4E7] bg-[#F4F4F5] px-4 py-3 font-mono text-[0.78rem] leading-6 text-[#18181B]",
  statValue: "font-serif text-[clamp(2rem,4vw,2.8rem)] font-black tracking-[-0.05em] text-[#18181B]",
  listDot: "mt-2 inline-flex size-1.5 shrink-0 bg-[#A1A1AA]",
  navShell:
    "border border-[#E4E4E7] bg-[#FAFAFA] px-4",
  navItem:
    "inline-flex h-8 items-center border-b border-transparent px-0 text-[0.62rem] uppercase tracking-[0.22em] text-[#71717A] transition-colors hover:text-[#18181B]",
  navItemActive: "border-[#18181B] text-[#18181B]",
  iconButton:
    "inline-flex size-8 items-center justify-center border border-[#E4E4E7] bg-[#FAFAFA] text-[#71717A] transition-colors hover:bg-[#F4F4F5] hover:text-[#18181B]",
} as const;

export default marketingTheme;
