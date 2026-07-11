import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";

/**
 * 首页产品交付与运行关系图。
 *
 * Creator 配置 Federation 并向用户交付 City；用户在本地环境中持有 City，
 * ghost Agent 位于 City 边界内部。所有关系使用一致的柔和曲线，默认保持均衡，
 * 仅在悬停或键盘聚焦时强调单条关系。
 */
export function HomeArchitectureDiagram() {
  const { t } = useTranslation("home");
  const reduce_motion = useReducedMotion();
  const [active_path, set_active_path] = useState<string | null>(null);

  const path_opacity = (path_key: string) => {
    if (active_path === null) {
      return 0.62;
    }

    return active_path === path_key ? 1 : 0.18;
  };
  const path_width = (path_key: string) => (active_path === path_key ? 1.8 : 1.2);

  return (
    <section className="border-t border-line bg-background py-20 md:py-28">
      <div className="mx-auto max-w-[1600px] px-5 md:px-8 lg:px-20">
        <div className="mb-12 max-w-3xl md:mb-16">
          <p className="mb-4 text-[0.78rem] font-medium uppercase text-text-soft">
            {t("architecture.sectionLabel")}
          </p>
          <h2 className="font-serif text-[clamp(1.625rem,3vw,2.25rem)] font-bold leading-[1.12] text-foreground">
            {t("architecture.title")}
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-[1.65] text-text-soft">
            {t("architecture.description")}
          </p>
        </div>

        <figure className="border-y border-line py-7 md:py-10" aria-labelledby="home-architecture-caption">
          <svg
            viewBox="0 0 1040 430"
            className="hidden h-auto w-full md:block"
            role="img"
            aria-label={t("architecture.diagramLabel")}
          >
            <defs>
              <marker id="architecture-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 Z" className="fill-text-soft" />
              </marker>
            </defs>

            <motion.path
              d="M182 177 C350 48 688 43 824 133"
              fill="none"
              className="stroke-text-soft"
              markerEnd="url(#architecture-arrow)"
              initial={false}
              animate={{ opacity: path_opacity("setup"), strokeWidth: path_width("setup") }}
              transition={{ duration: reduce_motion ? 0 : 0.25 }}
              onMouseEnter={() => set_active_path("setup")}
              onMouseLeave={() => set_active_path(null)}
            />
            <text x="503" y="69" textAnchor="middle" className="fill-text-soft text-[10px] font-medium">
              {t("architecture.paths.setup")}
            </text>

            <motion.path
              d="M190 224 C245 205 303 243 358 224"
              fill="none"
              className="stroke-[#3f7d5b]"
              markerEnd="url(#architecture-arrow)"
              initial={false}
              animate={{ opacity: path_opacity("delivery"), strokeWidth: path_width("delivery") }}
              transition={{ duration: reduce_motion ? 0 : 0.25 }}
              onMouseEnter={() => set_active_path("delivery")}
              onMouseLeave={() => set_active_path(null)}
            />
            <text x="274" y="204" textAnchor="middle" className="fill-text-soft text-[10px] font-medium">
              {t("architecture.paths.offer")}
            </text>

            <motion.path
              d="M685 300 C754 302 780 277 824 253"
              fill="none"
              className="stroke-[#4f6f9f]"
              markerEnd="url(#architecture-arrow)"
              initial={false}
              animate={{ opacity: path_opacity("connection"), strokeWidth: path_width("connection") }}
              transition={{ duration: reduce_motion ? 0 : 0.25 }}
              onMouseEnter={() => set_active_path("connection")}
              onMouseLeave={() => set_active_path(null)}
            />
            <text x="757" y="320" textAnchor="middle" className="fill-text-soft text-[10px] font-medium">
              {t("architecture.paths.connect")}
            </text>

            <g
              tabIndex={0}
              role="group"
              aria-label={t("architecture.creatorLabel")}
              onMouseEnter={() => set_active_path("delivery")}
              onMouseLeave={() => set_active_path(null)}
              onFocus={() => set_active_path("delivery")}
              onBlur={() => set_active_path(null)}
              className="outline-none"
            >
              <circle cx="130" cy="181" r="18" className="fill-background stroke-foreground" />
              <circle cx="124" cy="178" r="1.4" className="fill-foreground" />
              <circle cx="136" cy="178" r="1.4" className="fill-foreground" />
              <path d="M125 187 Q130 191 135 187" className="fill-none stroke-foreground" />
              <rect x="108" y="207" width="44" height="63" rx="22" className="fill-[#3f7d5b]" />
              <path d="M113 226 L92 244 M147 226 L166 240 M120 267 L113 293 M140 267 L147 293" className="stroke-foreground" strokeLinecap="round" />
              <text x="130" y="326" textAnchor="middle" className="fill-foreground text-[15px] font-semibold">
                {t("architecture.creator")}
              </text>
              <text x="130" y="347" textAnchor="middle" className="fill-text-subtle text-[9px]">
                {t("architecture.creatorCaption")}
              </text>
            </g>

            <g
              tabIndex={0}
              role="group"
              aria-label={t("architecture.userEnvironmentLabel")}
              onMouseEnter={() => set_active_path("delivery")}
              onMouseLeave={() => set_active_path(null)}
              onFocus={() => set_active_path("delivery")}
              onBlur={() => set_active_path(null)}
              className="outline-none"
            >
              <rect x="360" y="122" width="328" height="236" rx="8" className="fill-background stroke-line-strong" />
              <path d="M360 156 H688" className="stroke-line" />
              <circle cx="378" cy="139" r="3" className="fill-[#b45d4c]" />
              <circle cx="390" cy="139" r="3" className="fill-[#c2a650]" />
              <circle cx="402" cy="139" r="3" className="fill-[#3f7d5b]" />
              <text x="524" y="143" textAnchor="middle" className="fill-text-soft text-[10px] font-medium">
                {t("architecture.userEnvironment")}
              </text>

              <circle cx="412" cy="210" r="13" className="fill-background stroke-foreground" />
              <rect x="396" y="228" width="32" height="47" rx="16" className="fill-[#b45d4c]" />
              <path d="M400 243 L383 258 M424 243 L441 258 M404 273 L399 292 M420 273 L425 292" className="stroke-foreground" strokeLinecap="round" />
              <text x="412" y="315" textAnchor="middle" className="fill-foreground text-[11px] font-semibold">
                {t("architecture.user")}
              </text>

              <path d="M450 241 C460 231 468 251 477 241" className="fill-none stroke-text-subtle" markerEnd="url(#architecture-arrow)" />
              <text x="463" y="227" textAnchor="middle" className="fill-text-subtle text-[8px]">
                {t("architecture.paths.hold")}
              </text>

              <rect x="474" y="198" width="100" height="101" rx="28" className="fill-background stroke-[#3f7d5b]" strokeWidth="1.4" />
              <g transform="translate(489 213)" aria-hidden="true">
                <path d="M0 8 V1 L8 -5 L16 1 V8 M5 8 V3 H11 V8" className="fill-none stroke-foreground" strokeLinecap="round" strokeLinejoin="round" />
              </g>
              <text x="536" y="220" textAnchor="middle" className="fill-foreground text-[10px] font-semibold">
                {t("architecture.productCity")}
              </text>
              {[500, 524, 548].map((agent_x, agent_index) => {
                const agent_y = 255 + (agent_index === 1 ? -6 : 0);

                return (
                  <g key={agent_x}>
                    <path
                      d={`M${agent_x - 9} ${agent_y + 17} V${agent_y} C${agent_x - 9} ${agent_y - 7} ${agent_x - 5} ${agent_y - 11} ${agent_x} ${agent_y - 11} C${agent_x + 5} ${agent_y - 11} ${agent_x + 9} ${agent_y - 7} ${agent_x + 9} ${agent_y} V${agent_y + 17} L${agent_x + 5} ${agent_y + 14} L${agent_x} ${agent_y + 17} L${agent_x - 5} ${agent_y + 14} Z`}
                      className="fill-[#4f6f9f]"
                    />
                    <circle cx={agent_x - 3} cy={agent_y - 2} r="1.2" className="fill-background" />
                    <circle cx={agent_x + 3} cy={agent_y - 2} r="1.2" className="fill-background" />
                  </g>
                );
              })}
              <text x="524" y="318" textAnchor="middle" className="fill-text-subtle text-[8px]">
                {t("architecture.agentsInCity")}
              </text>

              <path d="M594 205 V292" className="stroke-line" />
              <text x="637" y="213" textAnchor="middle" className="fill-foreground text-[10px] font-semibold">
                {t("architecture.productBoundary")}
              </text>
              <text x="637" y="237" textAnchor="middle" className="fill-text-subtle text-[9px]">{t("architecture.localRuntime")}</text>
              <text x="637" y="258" textAnchor="middle" className="fill-text-subtle text-[9px]">{t("architecture.memoryAndTools")}</text>
              <text x="637" y="279" textAnchor="middle" className="fill-text-subtle text-[9px]">{t("architecture.userControl")}</text>
            </g>

            <g
              tabIndex={0}
              role="group"
              aria-label={t("architecture.federationLabel")}
              onMouseEnter={() => set_active_path("connection")}
              onMouseLeave={() => set_active_path(null)}
              onFocus={() => set_active_path("connection")}
              onBlur={() => set_active_path(null)}
              className="outline-none"
            >
              <circle cx="882" cy="205" r="96" className="fill-background stroke-line-strong" />
              <circle cx="864" cy="151" r="12" className="fill-background stroke-foreground" />
              <circle cx="882" cy="144" r="12" className="fill-background stroke-foreground" />
              <circle cx="900" cy="151" r="12" className="fill-background stroke-foreground" />
              <text x="882" y="172" textAnchor="middle" className="fill-foreground text-[15px] font-semibold">{t("architecture.federation")}</text>
              <text x="882" y="192" textAnchor="middle" className="fill-text-soft text-[9px]">{t("architecture.federationCaption")}</text>
              <path d="M823 210 H941" className="stroke-line" />
              <text x="850" y="236" textAnchor="middle" className="fill-text-soft text-[9px]">{t("architecture.services.models")}</text>
              <text x="914" y="236" textAnchor="middle" className="fill-text-soft text-[9px]">{t("architecture.services.services")}</text>
              <text x="850" y="262" textAnchor="middle" className="fill-text-soft text-[9px]">{t("architecture.services.auth")}</text>
              <text x="914" y="262" textAnchor="middle" className="fill-text-soft text-[9px]">{t("architecture.services.usage")}</text>
            </g>
          </svg>

          <svg viewBox="0 0 360 590" className="h-auto w-full md:hidden" role="img" aria-label={t("architecture.diagramLabel")}>
            <defs>
              <marker id="architecture-arrow-mobile" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 Z" className="fill-text-soft" />
              </marker>
            </defs>

            <circle cx="62" cy="68" r="12" className="fill-background stroke-foreground" />
            <rect x="47" y="84" width="30" height="43" rx="15" className="fill-[#3f7d5b]" />
            <text x="62" y="151" textAnchor="middle" className="fill-foreground text-[11px] font-semibold">{t("architecture.creator")}</text>

            <path d="M80 79 C144 25 227 25 278 78" className="fill-none stroke-text-soft" markerEnd="url(#architecture-arrow-mobile)" />
            <text x="180" y="37" textAnchor="middle" className="fill-text-soft text-[8px]">{t("architecture.paths.setup")}</text>

            <circle cx="294" cy="105" r="56" className="fill-background stroke-line-strong" />
            <circle cx="285" cy="72" r="7" className="fill-background stroke-foreground" />
            <circle cx="294" cy="68" r="7" className="fill-background stroke-foreground" />
            <circle cx="303" cy="72" r="7" className="fill-background stroke-foreground" />
            <text x="294" y="91" textAnchor="middle" className="fill-foreground text-[10px] font-semibold">{t("architecture.federation")}</text>
            <text x="294" y="111" textAnchor="middle" className="fill-text-subtle text-[7px]">{t("architecture.services.models")} · {t("architecture.services.services")}</text>
            <text x="294" y="128" textAnchor="middle" className="fill-text-subtle text-[7px]">{t("architecture.services.auth")} · {t("architecture.services.usage")}</text>

            <path d="M62 162 C45 185 78 204 62 223" className="fill-none stroke-[#3f7d5b]" markerEnd="url(#architecture-arrow-mobile)" />
            <text x="82" y="195" className="fill-text-soft text-[8px]">{t("architecture.paths.offer")}</text>

            <rect x="30" y="228" width="300" height="276" rx="7" className="fill-background stroke-line-strong" />
            <path d="M30 260 H330" className="stroke-line" />
            <circle cx="47" cy="244" r="2.5" className="fill-[#b45d4c]" />
            <circle cx="57" cy="244" r="2.5" className="fill-[#c2a650]" />
            <circle cx="67" cy="244" r="2.5" className="fill-[#3f7d5b]" />
            <text x="180" y="248" textAnchor="middle" className="fill-text-soft text-[9px] font-medium">{t("architecture.userEnvironment")}</text>

            <circle cx="82" cy="321" r="10" className="fill-background stroke-foreground" />
            <rect x="69" y="334" width="26" height="38" rx="13" className="fill-[#b45d4c]" />
            <text x="82" y="393" textAnchor="middle" className="fill-foreground text-[9px] font-semibold">{t("architecture.user")}</text>

            <path d="M105 345 C115 335 124 355 132 345" className="fill-none stroke-text-subtle" markerEnd="url(#architecture-arrow-mobile)" />
            <text x="118" y="332" textAnchor="middle" className="fill-text-subtle text-[7px]">{t("architecture.paths.hold")}</text>

            <rect x="137" y="299" width="100" height="106" rx="27" className="fill-background stroke-[#3f7d5b]" />
            <g transform="translate(150 313)">
              <path d="M0 7 V1 L7 -4 L14 1 V7 M4 7 V3 H10 V7" className="fill-none stroke-foreground" strokeLinecap="round" strokeLinejoin="round" />
            </g>
            <text x="202" y="320" textAnchor="middle" className="fill-foreground text-[8px] font-semibold">{t("architecture.productCity")}</text>
            {[165, 187, 209].map((agent_x, agent_index) => {
              const agent_y = 357 + (agent_index === 1 ? -6 : 0);

              return (
                <g key={agent_x}>
                  <path
                    d={`M${agent_x - 7} ${agent_y + 15} V${agent_y} C${agent_x - 7} ${agent_y - 6} ${agent_x - 4} ${agent_y - 9} ${agent_x} ${agent_y - 9} C${agent_x + 4} ${agent_y - 9} ${agent_x + 7} ${agent_y - 6} ${agent_x + 7} ${agent_y} V${agent_y + 15} L${agent_x + 4} ${agent_y + 12} L${agent_x} ${agent_y + 15} L${agent_x - 4} ${agent_y + 12} Z`}
                    className="fill-[#4f6f9f]"
                  />
                  <circle cx={agent_x - 2.4} cy={agent_y - 1.5} r="1" className="fill-background" />
                  <circle cx={agent_x + 2.4} cy={agent_y - 1.5} r="1" className="fill-background" />
                </g>
              );
            })}
            <text x="187" y="421" textAnchor="middle" className="fill-text-subtle text-[8px]">{t("architecture.agentsInCity")}</text>

            <text x="272" y="314" textAnchor="middle" className="fill-foreground text-[8px] font-semibold">{t("architecture.productBoundary")}</text>
            <text x="272" y="339" textAnchor="middle" className="fill-text-subtle text-[7px]">{t("architecture.localRuntime")}</text>
            <text x="272" y="358" textAnchor="middle" className="fill-text-subtle text-[7px]">{t("architecture.memoryAndTools")}</text>
            <text x="272" y="377" textAnchor="middle" className="fill-text-subtle text-[7px]">{t("architecture.userControl")}</text>

            <path d="M225 430 C276 430 303 318 294 176" className="fill-none stroke-[#4f6f9f]" markerEnd="url(#architecture-arrow-mobile)" />
            <text x="285" y="456" textAnchor="end" className="fill-text-soft text-[8px]">{t("architecture.paths.connect")}</text>
            <text x="180" y="548" textAnchor="middle" className="fill-text-subtle text-[8px]">{t("architecture.mobileCaption")}</text>
          </svg>

          <figcaption id="home-architecture-caption" className="sr-only">
            {t("architecture.diagramLabel")}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

export default HomeArchitectureDiagram;
