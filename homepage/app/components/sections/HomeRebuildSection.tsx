import { Link } from "react-router";
import { useTranslation } from "react-i18next";

/**
 * 首页主视觉模块。
 * 说明：
 * 1. 直接使用参考稿的分栏与边框语言，并修正当前实现里的高度比例问题。
 * 2. 首页作为独立 landing，不复用全局营销页头尾，避免破坏版式完整性。
 */
const HOME_CONTENT = {
  zh: {
    frameTopLeft: "Est. MMXXIV",
    frameBottomRightTop: "Agent",
    frameBottomRightBottom: "Operations",
    heroTitle: "Downcity",
    sideTopLabel: "Function",
    sideTopGlyph: "✤",
    sideTopText: "把仓库、目录、任务与上下文收束成一个可接管的 AI Agent 运行单元。",
    sideTopPath: "/zh/start",
    sideBottomLabel: "Form",
    sideBottomGlyph: "✦",
    sideBottomText: "用明确的结构和边界组织业务表层，让多 Agent 协作保持秩序与审计能力。",
    sideBottomPath: "/zh/docs",
    cards: [
      {
        index: "01",
        title: "PRODUCT",
        body: "控制台、扩展、SDK 与 UI 层组成同一套运行界面，服务不同操作场景。",
        letter: "P",
        path: "/zh/product",
      },
      {
        index: "02",
        title: "SYSTEM",
        body: "从仓库到执行链路，所有结构都围绕 one folder, one agent 的运行原则展开。",
        letter: "S",
        path: "/zh/features",
      },
      {
        index: "03",
        title: "ACCESS",
        body: "通过文档、白皮书与社区入口接入 Downcity，把真实业务映射进 Agent 城市。",
        letter: "A",
        path: "/zh/whitepaper",
      },
    ],
    mobileNote: "推荐在桌面端查看完整布局",
  },
  en: {
    frameTopLeft: "Est. MMXXIV",
    frameBottomRightTop: "Agent",
    frameBottomRightBottom: "Operations",
    heroTitle: "Downcity",
    sideTopLabel: "Function",
    sideTopGlyph: "✤",
    sideTopText: "Turn repos, folders, tasks, and context into a takeover-ready AI agent operating unit.",
    sideTopPath: "/start",
    sideBottomLabel: "Form",
    sideBottomGlyph: "✦",
    sideBottomText: "Organize the business surface with explicit structure and boundaries so multi-agent work stays clear and auditable.",
    sideBottomPath: "/en/docs",
    cards: [
      {
        index: "01",
        title: "PRODUCT",
        body: "Console, extension, SDK, and UI layer form one operating surface across different workflows.",
        letter: "P",
        path: "/product",
      },
      {
        index: "02",
        title: "SYSTEM",
        body: "From repository to execution path, everything is shaped by the one folder, one agent principle.",
        letter: "S",
        path: "/features",
      },
      {
        index: "03",
        title: "ACCESS",
        body: "Enter through docs, whitepaper, and community to map real operations into the agent city.",
        letter: "A",
        path: "/whitepaper",
      },
    ],
    mobileNote: "Desktop layout recommended for full experience",
  },
} as const;

const frameCornerClass = "absolute z-30 h-[12px] w-[12px] bg-[#D1D5DB]";
const hoverPanelClass = "transition-colors duration-500 hover:bg-[#F5F5F6]";
const displayFontStyle = {
  fontFamily: "Space Grotesk, sans-serif",
  fontWeight: 700,
} as const;
const bodyFontStyle = { fontFamily: "Space Grotesk, sans-serif", fontWeight: 400 } as const;

const dashedBorderRight = {
  backgroundImage: "linear-gradient(to bottom, #E7E7EB 50%, rgba(255,255,255,0) 0%)",
  backgroundPosition: "right",
  backgroundSize: "1px 12px",
  backgroundRepeat: "repeat-y",
} as const;

const dashedBorderBottom = {
  backgroundImage: "linear-gradient(to right, #E7E7EB 50%, rgba(255,255,255,0) 0%)",
  backgroundPosition: "bottom",
  backgroundSize: "12px 1px",
  backgroundRepeat: "repeat-x",
} as const;

const dashedBorderTop = {
  backgroundImage: "linear-gradient(to right, #E7E7EB 50%, rgba(255,255,255,0) 0%)",
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
        <span className="text-[2rem] text-[#111113]/18" style={displayFontStyle}>
          {glyph}
        </span>
        <span className="text-right text-[10px] uppercase tracking-[0.32em] text-[#6B7280]" style={bodyFontStyle}>
          {label}
        </span>
      </div>

      <p className="mt-4 max-w-[26ch] text-[13px] leading-[1.75] text-[#6B7280]" style={bodyFontStyle}>
        {text}
      </p>

      {hasBottomCorner ? <div className="absolute -bottom-[6px] -left-[6px] h-[12px] w-[12px] bg-[#D1D5DB]" /> : null}
      {!hasBottomCorner ? (
        <div className="absolute bottom-6 right-6 flex h-10 w-10 items-center justify-center rounded-full border border-[#E7E7EB] opacity-40">
          <div className="h-1.5 w-1.5 rounded-full bg-[#111113]" />
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
        <span className="mb-2 block text-xs text-[#111113]/35" style={displayFontStyle}>
          {index}
        </span>
        <div className="h-px w-10 bg-[#E7E7EB]" />
      </div>

      <div className="relative z-10 max-w-[34ch]">
        <h3 className="mb-3 text-[1.1rem] text-[#111113] md:text-[1.25rem]" style={displayFontStyle}>
          {title}
        </h3>
        <p className="text-[13px] leading-[1.75] text-[#6B7280]" style={bodyFontStyle}>
          {body}
        </p>
      </div>

      <div className="absolute right-8 top-8 text-[52px] text-[#E5E7EB] opacity-36 transition-opacity duration-500 group-hover:opacity-70" style={displayFontStyle}>
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
    <main className="flex min-h-screen w-full flex-col bg-[#FCFCFD] p-4 text-[#6B7280] antialiased md:p-8 lg:p-10">
      <div className="relative flex min-h-[calc(100vh-2rem)] flex-1 flex-col border border-[#E7E7EB] md:min-h-[calc(100vh-4rem)] lg:grid lg:min-h-[calc(100vh-5rem)] lg:grid-rows-[1.85fr_1fr]">
        <div className={`${frameCornerClass} -left-[6px] -top-[6px]`} />
        <div className={`${frameCornerClass} -right-[6px] -top-[6px]`} />
        <div className={`${frameCornerClass} -bottom-[6px] -left-[6px]`} />
        <div className={`${frameCornerClass} -bottom-[6px] -right-[6px]`} />

        <div className="relative flex min-h-[56vh] flex-col lg:min-h-0 lg:flex-row">
          <div className="group relative min-h-[42vh] flex-1 overflow-hidden border-b border-[#E7E7EB] bg-[#F7F7F8] lg:min-h-0 lg:border-b-0 lg:border-r" style={dashedBorderRight}>
            <div className="pointer-events-none absolute inset-0 opacity-20">
              <div className="absolute bottom-0 top-0 left-1/3 w-px border-l border-dashed border-[#111113]" />
              <div className="absolute bottom-0 top-0 right-1/3 w-px border-l border-dashed border-[#111113]" />
              <div className="absolute left-0 right-0 top-1/2 h-px border-t border-dashed border-[#111113]" />
              <div className="absolute inset-8 rounded-full border border-[#111113] opacity-16 md:inset-10 lg:inset-14" />
            </div>

            <div className="absolute left-8 top-8 z-20">
              <span className="text-[11px] uppercase tracking-[0.24em] text-[#111113]" style={bodyFontStyle}>
                {content.frameTopLeft}
              </span>
            </div>

            <div className="absolute bottom-8 right-8 z-20 text-right">
              <span className="block text-[11px] uppercase tracking-[0.24em] text-[#111113]" style={bodyFontStyle}>
                {content.frameBottomRightTop}
              </span>
              <span className="block text-[11px] uppercase tracking-[0.24em] text-[#111113]" style={bodyFontStyle}>
                {content.frameBottomRightBottom}
              </span>
            </div>

            <div className="relative z-10 flex h-full w-full items-center justify-center px-8 py-10 md:px-12 lg:px-10 xl:px-14">
              <h1
                className="select-none leading-[0.88] tracking-[-0.075em] text-[#202024] opacity-92 mix-blend-multiply transition-transform duration-1000 ease-out group-hover:scale-[1.02]"
                style={{
                  ...displayFontStyle,
                  fontSize: "clamp(4.8rem, 13vw, 11.5rem)",
                }}
              >
                {content.heroTitle}
              </h1>
            </div>

            <div className="absolute left-1/2 top-1/2 z-0 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center opacity-38">
              <div className="h-px w-full bg-[#111113]" />
              <div className="absolute h-full w-px bg-[#111113]" />
            </div>
          </div>

          <div className="flex w-full flex-col bg-[#FCFCFD] lg:w-[25%] lg:min-w-[320px]">
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

        <div className="relative grid grid-cols-1 border-t border-[#E7E7EB] md:grid-cols-3" style={dashedBorderTop}>
          <div className="absolute -top-[6px] left-[33.33%] z-30 ml-[-6px] hidden h-[12px] w-[12px] bg-[#D1D5DB] md:block" />
          <div className="absolute -top-[6px] left-[66.66%] z-30 ml-[-6px] hidden h-[12px] w-[12px] bg-[#D1D5DB] md:block" />

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

      <div className="mt-4 text-center text-xs text-[#6B7280]/60 md:hidden" style={bodyFontStyle}>
        {content.mobileNote}
      </div>
    </main>
  );
}
