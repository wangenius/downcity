import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { marketingTheme } from "@/lib/marketing-theme";

/**
 * 首页主视觉模块。
 * 说明：
 * 1. 直接使用参考稿的分栏与边框语言，并修正当前实现里的高度比例问题。
 * 2. 首页接入全局 Header，因此主视觉高度跟随内容区而不是再次强占整屏。
 */
const HOME_CONTENT = {
  zh: {
    frameTopLeft: "Est. MMXXIV",
    frameBottomRightTop: "Agent",
    frameBottomRightBottom: "Infrastructure",
    heroTitle: "Downcity",
    sideTopLabel: "For Builders",
    sideTopGlyph: "✤",
    sideTopText: "用一套可复用运行层构建多个 Agent 产品，而不是每个项目都重搭后端。",
    sideTopPath: "/zh/start",
    sideBottomLabel: "Runtime",
    sideBottomGlyph: "✦",
    sideBottomText: "把模型、工具、任务、记忆、服务、权限、用量、计费和控制台收束到统一基础设施里。",
    sideBottomPath: "/zh/docs",
    cards: [
      {
        index: "01",
        title: "BUILDERS",
        body: "面向 creators、indie builders 和团队，让下一个 AI 产品直接复用已有 Agent 基础设施。",
        letter: "P",
        path: "/zh/product",
      },
      {
        index: "02",
        title: "RUNTIME",
        body: "Repo 或 folder 可以成为 Agent 的运行边界，但 Downcity 负责更完整的长期运行层。",
        letter: "S",
        path: "/zh/features",
      },
      {
        index: "03",
        title: "OPERATIONS",
        body: "让 Agent 从一次性聊天变成可观察、可扩展、可接入真实业务的执行单元。",
        letter: "A",
        path: "/zh/whitepaper",
      },
    ],
    mobileNote: "推荐在桌面端查看完整布局",
  },
  en: {
    frameTopLeft: "Est. MMXXIV",
    frameBottomRightTop: "Agent",
    frameBottomRightBottom: "Infrastructure",
    heroTitle: "Downcity",
    sideTopLabel: "For Builders",
    sideTopGlyph: "✤",
    sideTopText: "Build many agent products on one reusable runtime instead of rebuilding the backend for every project.",
    sideTopPath: "/start",
    sideBottomLabel: "Runtime",
    sideBottomGlyph: "✦",
    sideBottomText: "Bring models, tools, tasks, memory, services, permissions, usage, billing, and control surfaces into one infrastructure layer.",
    sideBottomPath: "/en/docs",
    cards: [
      {
        index: "01",
        title: "BUILDERS",
        body: "For creators, indie builders, and teams who want the next AI product to reuse existing agent infrastructure.",
        letter: "P",
        path: "/product",
      },
      {
        index: "02",
        title: "RUNTIME",
        body: "A repo or folder can be an agent boundary, while Downcity owns the broader long-running runtime layer.",
        letter: "S",
        path: "/features",
      },
      {
        index: "03",
        title: "OPERATIONS",
        body: "Move agents beyond one-off chats into observable, extensible execution units connected to real workflows.",
        letter: "A",
        path: "/whitepaper",
      },
    ],
    mobileNote: "Desktop layout recommended for full experience",
  },
} as const;

const frameCornerClass = "absolute z-30 h-[12px] w-[12px] bg-corner-marker";
const hoverPanelClass = "transition-colors duration-500 hover:bg-surface-hover";
const displayFontStyle = {
  fontFamily: "Space Grotesk, sans-serif",
  fontWeight: 700,
} as const;
const bodyFontStyle = { fontFamily: "Space Grotesk, sans-serif", fontWeight: 400 } as const;

const dashedBorderRight = {
  backgroundImage: "linear-gradient(to bottom, var(--line) 50%, transparent 0%)",
  backgroundPosition: "right",
  backgroundSize: "1px 12px",
  backgroundRepeat: "repeat-y",
} as const;

const dashedBorderBottom = {
  backgroundImage: "linear-gradient(to right, var(--line) 50%, transparent 0%)",
  backgroundPosition: "bottom",
  backgroundSize: "12px 1px",
  backgroundRepeat: "repeat-x",
} as const;

const dashedBorderTop = {
  backgroundImage: "linear-gradient(to right, var(--line) 50%, transparent 0%)",
  backgroundPosition: "top",
  backgroundSize: "12px 1px",
  backgroundRepeat: "repeat-x",
} as const;

function InfoCell({
  glyph,
  label,
  text,
  to,
  hasBottomCorner,
}: {
  glyph: string;
  label: string;
  text: string;
  to: string;
  hasBottomCorner?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`relative flex min-h-[200px] flex-1 flex-col justify-between p-7 md:p-8 ${hoverPanelClass}`}
      style={hasBottomCorner ? dashedBorderBottom : undefined}
    >
      <div className="flex items-start justify-between gap-6">
        <span className="text-[2rem] text-foreground/18" style={displayFontStyle}>
          {glyph}
        </span>
        <span className="text-right text-[10px] uppercase tracking-[0.32em] text-text-soft" style={bodyFontStyle}>
          {label}
        </span>
      </div>

      <p className="mt-4 max-w-[26ch] text-[13px] leading-[1.75] text-text-soft" style={bodyFontStyle}>
        {text}
      </p>

      {hasBottomCorner ? <div className="absolute -bottom-[6px] -left-[6px] h-[12px] w-[12px] bg-corner-marker" /> : null}
      {!hasBottomCorner ? (
        <div className="absolute bottom-6 right-6 flex h-10 w-10 items-center justify-center rounded-full border border-line opacity-40">
          <div className="h-1.5 w-1.5 rounded-full bg-foreground" />
        </div>
      ) : null}
    </Link>
  );
}

function DetailCard({
  index,
  title,
  body,
  letter,
  to,
  showDivider,
}: {
  index: string;
  title: string;
  body: string;
  letter: string;
  to: string;
  showDivider?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`group relative flex min-h-[220px] flex-col justify-end p-8 ${hoverPanelClass}`}
      style={showDivider ? dashedBorderRight : undefined}
    >
      <div className="absolute left-8 top-8 w-full pr-14">
        <span className="mb-2 block text-xs text-foreground/35" style={displayFontStyle}>
          {index}
        </span>
        <div className="h-px w-10 bg-line" />
      </div>

      <div className="relative z-10 max-w-[34ch]">
        <h3 className="mb-3 text-[1.1rem] text-foreground md:text-[1.25rem]" style={displayFontStyle}>
          {title}
        </h3>
        <p className="text-[13px] leading-[1.75] text-text-soft" style={bodyFontStyle}>
          {body}
        </p>
      </div>

      <div className="absolute right-8 top-8 text-[52px] text-hero-mark opacity-36 transition-opacity duration-500 group-hover:opacity-70" style={displayFontStyle}>
        {letter}
      </div>
    </Link>
  );
}

export function HomeRebuildSection() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.toLowerCase().startsWith("zh");
  const content = isZh ? HOME_CONTENT.zh : HOME_CONTENT.en;

  return (
    <main className="flex min-h-full w-full flex-col bg-surface px-4 pb-4 pt-2 text-text-soft antialiased md:px-8 md:pb-8 md:pt-4 lg:px-10 lg:pb-10 lg:pt-5">
      <div className="relative flex min-h-[calc(100dvh-4.5rem)] flex-1 flex-col border border-line md:min-h-[calc(100dvh-6.5rem)] lg:grid lg:min-h-[calc(100dvh-7.25rem)] lg:grid-rows-[1.85fr_1fr]">
        <div className={`${frameCornerClass} -left-[6px] -top-[6px]`} />
        <div className={`${frameCornerClass} -right-[6px] -top-[6px]`} />
        <div className={`${frameCornerClass} -bottom-[6px] -left-[6px]`} />
        <div className={`${frameCornerClass} -bottom-[6px] -right-[6px]`} />

        <div className="relative flex min-h-[56vh] flex-col lg:min-h-0 lg:flex-row">
          <div className="group relative min-h-[42vh] flex-1 overflow-hidden border-b border-line bg-surface-soft lg:min-h-0 lg:border-b-0 lg:border-r" style={dashedBorderRight}>
            <div className="pointer-events-none absolute inset-0 opacity-20">
              <div className="absolute bottom-0 top-0 left-1/3 w-px border-l border-dashed border-foreground" />
              <div className="absolute bottom-0 top-0 right-1/3 w-px border-l border-dashed border-foreground" />
              <div className="absolute left-0 right-0 top-1/2 h-px border-t border-dashed border-foreground" />
              <div className="absolute inset-8 rounded-full border border-foreground opacity-16 md:inset-10 lg:inset-14" />
            </div>

            <div className="absolute left-8 top-8 z-20">
              <span className="text-[11px] uppercase tracking-[0.24em] text-foreground" style={bodyFontStyle}>
                {content.frameTopLeft}
              </span>
            </div>

            <div className="absolute bottom-8 right-8 z-20 text-right">
              <span className="block text-[11px] uppercase tracking-[0.24em] text-foreground" style={bodyFontStyle}>
                {content.frameBottomRightTop}
              </span>
              <span className="block text-[11px] uppercase tracking-[0.24em] text-foreground" style={bodyFontStyle}>
                {content.frameBottomRightBottom}
              </span>
            </div>

            <div className="relative z-10 flex h-full w-full items-center justify-center px-8 py-10 md:px-12 lg:px-10 xl:px-14">
              <div className="flex flex-col items-center gap-5 md:gap-6">
                <div className={`${marketingTheme.controlSurface} flex h-12 w-12 items-center justify-center bg-surface/92 shadow-[var(--shadow-control-inset)] backdrop-blur-sm md:h-14 md:w-14`}>
                  <img src="/icon.svg" alt="Downcity logo" className="brand-logo h-7 w-7 object-contain opacity-95 md:h-8 md:w-8" />
                </div>

                <h1
                  className="select-none leading-[0.88] tracking-[-0.075em] text-hero-foreground opacity-92 transition-transform duration-1000 ease-out group-hover:scale-[1.02]"
                  style={{
                    ...displayFontStyle,
                    fontSize: "clamp(4.8rem, 13vw, 11.5rem)",
                  }}
                >
                  {content.heroTitle}
                </h1>
              </div>
            </div>

            <div className="absolute left-1/2 top-1/2 z-0 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center opacity-38">
              <div className="h-px w-full bg-foreground" />
              <div className="absolute h-full w-px bg-foreground" />
            </div>
          </div>

          <div className="flex w-full flex-col bg-surface lg:w-[25%] lg:min-w-[320px]">
            <InfoCell
              glyph={content.sideTopGlyph}
              label={content.sideTopLabel}
              text={content.sideTopText}
              to={content.sideTopPath}
              hasBottomCorner
            />
            <InfoCell
              glyph={content.sideBottomGlyph}
              label={content.sideBottomLabel}
              text={content.sideBottomText}
              to={content.sideBottomPath}
            />
          </div>
        </div>

        <div className="relative grid grid-cols-1 border-t border-line md:grid-cols-3" style={dashedBorderTop}>
          <div className="absolute -top-[6px] left-[33.33%] z-30 ml-[-6px] hidden h-[12px] w-[12px] bg-corner-marker md:block" />
          <div className="absolute -top-[6px] left-[66.66%] z-30 ml-[-6px] hidden h-[12px] w-[12px] bg-corner-marker md:block" />

          {content.cards.map((card, index) => (
            <DetailCard
              key={card.index}
              index={card.index}
              title={card.title}
              body={card.body}
              letter={card.letter}
              to={card.path}
              showDivider={index < content.cards.length - 1}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 text-center text-xs text-text-soft/60 md:hidden" style={bodyFontStyle}>
        {content.mobileNote}
      </div>
    </main>
  );
}
