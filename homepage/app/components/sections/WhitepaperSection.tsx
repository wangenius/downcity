import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  IconCheck,
  IconCopy,
  IconDownload,
} from "@tabler/icons-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const INSTALL_COMMAND = "npm i -g downcity";
const WHITEPAPER_DOWNLOAD_PATH = "/agent-strategy-whitepaper-2026-03-09.md";
const WHITEPAPER_DOWNLOAD_FILENAME = "agent-strategy-whitepaper-2026-03-09.md";

/**
 * 首页白皮书模块。
 * 说明：
 * 1. 承载白皮书主内容，直接用于 home 首页展示。
 * 2. 保留安装命令与白皮书导出交互。
 * 3. 通过同构的中英文结构降低后续维护成本。
 */
const WHITEPAPER = {
  zh: {
    badge: "白皮书",
    title: "当 Agent 进入生产：人的主导权、协作关系与上下文环境",
    epigraph: "缗蛮黄鸟，止于丘隅。",
    sections: [
      {
        title: "我们真正面对的问题",
        paragraphs: [
          "这几年，业界对 Agent 的期待基本建立在一种线性进步的假设上：似乎只要底层模型持续迭代，工具链不断丰富，全自动化的终局就会自然到来。在这种叙事里，唯一的悬念只是技术指标何时达标。然而，一旦将视线从概念演示切入真实的业务现场，阻碍落地的真正矛盾立刻就会浮出水面。",
          "在复杂的生产环境中，核心命题从来不是“大模型有多聪明”，而是团队在引入这类具备一定自主性的系统后，能否继续保持对业务目标与系统边界的绝对把控。当前主流的落地方案往往带有极强的侵入性，它们暗含了一个前提，即现有的工作流必须被重构，业务状态必须向新平台迁移，以此来迎合所谓的先进范式。这种做法本质上是在用工具规训人，迫使作为主体的人去迁就系统的逻辑。团队在短期内或许获得了某种前沿的幻觉，但在长周期的迭代中，却常常陷入一个悖论——**系统的自治能力越强，业务人员对工作底座的掌控感反而越稀薄。**",
          "更底层地看，这种掌控感的稀薄，本质上源于对**“信息损耗”**的忽视。如果业界对 Agent 的终局期待是高度类人的（Human-like），那么现实中 Human 与 Human 之间固有的沟通效率瓶颈、隐性知识丢失与上下文错位，必然也会全盘映射到 Human 与 Agent 之间。",
          "当业务人员被迫离开熟悉的工作流，去抽象的平台里使用各类表单和配置去指挥 Agent 时，实质上是在本就存在的人机沟通摩擦之上，又强加了一层“系统翻译”的损耗。每一次从自然工作流向平台表单的切换，都是一次隐性上下文的衰减。**因此，能让 Human 与 Agent 之间信息交互损耗降到最低的行为模式，才是当前阶段最好的 Agent 架构设计。**它解释了为什么工具绝不应再试图规训人，而必须主动对接人的原生业务载体。",
          "Downcity 的设计哲学正是对这一悖论的修正。它拒绝要求组织为了拥抱 AI 而进行伤筋动骨的范式迁移，而是主张将主导权彻底交还给人类主体。在这里，“止”被具象化为一种严密的业务秩序：由人明确划定业务的护城河并掌握底层控制权，Agent 的角色则被严格限定在这些清晰的规则内，去释放高密度的执行力。",
        ],
      },
      {
        title: "为什么“替代叙事”在真实的复杂系统中必然失效",
        paragraphs: [
          "“替代人”是消费级 AI 最具诱惑力的叙事，但在严肃的业务现场，这却是一个工程伪命题。因为真实的业务运转绝不是一系列离散、无状态任务的简单拼接，它是一张由**连续的上下文、隐性的组织契约、异常兜底机制与责任网络**交织而成的复杂拓扑。",
          "很多平台型 Agent 方案的底层架构，本质上是在做**“状态剥离与系统封装”**：它们试图把复杂的业务环境收编进一个黑盒式的控制中枢，让 AI 在无菌的沙盒中给出“标准答案”。这种架构在短期演示中极其顺滑，但随着业务深入，必然会引发效率提升与治理能力之间的巨大“剪刀差”。",
          "当系统以“替代”为核心目标时，往往会天然地屏蔽过程逻辑。这导致业务人员逐渐丧失了对系统状态的感知力（Situation Awareness）。一旦 Agent 在陌生语境中发生幻觉或逻辑偏移，团队连纠偏的抓手都找不到——因为人类既不知道机器基于什么上下文做出了决策，也无法直接介入其黑盒化的思考链路。生产系统中最危险的，往往不是确定的错误，而是“在黑盒中发生且无法追溯的失控”。",
          "因此，严肃生产环境真正需要的架构，不是切断上下文的“Human or Agent”，而是共享上下文的**“Human with Agent”**。必须由人类来定义业务环境的物理边界，承载最终的兜底责任，而 Agent 仅作为这一确定性环境中的“高频执行器”。谁掌握了环境的解释权，谁就真正控制了系统的走向。",
        ],
      },
      {
        title: "认知同构：从“重建抽象平台”到“继承知识拓扑”",
        paragraphs: [
          "当前大多数 AI 落地项目的最大阻力，在于极高的“重置成本”。这种重置不仅是数据的搬运，更是**组织心智与认知拓扑的毁灭与重建**。",
          "在任何真实的业务团队（运营、设计、分析、研发）里，最有价值的资产从来不只是孤立的数据本身，而是它们之间的**结构**——文件夹的分类习惯、协作文档的命名规则、任务状态的流转标记。一个团队长期使用的目录或工作空间（Workspace/Repo），本身就是这个组织做决策、定边界、分优先级的“实体化知识图谱”。它是 Human 与 Human 之间经过无数次试错磨合出的、信息损耗最低的沟通协议。",
          "Downcity 的核心洞察在于：**最好的 Prompt 结构，就是人类已经建构好的目录结构；最好的知识库，就是人类每天都在阅读和修改的源文件。**",
          "我们拒绝把这些充满生命力的组织资产，生硬地切割并导入到另一个满是表单和向量数据库的抽象平台中。相反，我们让 Agent 直接“降维”进入人类原生工作区，去读取、理解并遵循现有的文件拓扑。团队不需要为了使用 AI 去学习一套全新的中台语言，Agent 直接继承了团队的隐性知识网络，实现了真正的“零摩擦冷启动”。",
        ],
      },
      {
        title: "人机边界的重塑：管理文件目录，就是管理智能体",
        paragraphs: [
          "当我们放弃了宏大的“全知全能中枢”叙事，转而将 Agent 嵌入原生的文档与目录时，我们实际上完成了一次至关重要的**人机界面（HCI）范式转移**。",
          "在传统的 Agent 平台中，管理智能体意味着要面对复杂的节点拖拽、参数调试和 JSON 配置，这对绝大多数业务人员来说是难以跨越的认知鸿沟。但在这种原生贴合的架构下，我们实现了**“操作维度的降维与认知模型的同构”**：",
          "- 新增一个业务场景边界？——只需在系统里新建一个文件夹。",
          "- 调整 Agent 的执行规范？——只需在目录下修改几句自然语言的规则文档（Profile）。",
          "- 审计 Agent 的中间思考过程？——只需点开它刚刚写入目录的 Markdown 产物。",
          "“管理目录，就是管理智能体。” 这不仅仅是一句交互上的讨巧，它是对 AI 祛魅后最深刻的技术主张。当机器的状态表达与人类的心智模型完全同构时，我们彻底消解了原本横亘在人与大模型之间的“翻译层”。团队不需要专门的培训，因为他们几十年来一直在做文件与文档管理；这种**“路径贴合”**本身，就是抵御大模型不确定性最坚固的防线。",
        ],
      },
      {
        title: "真正的差异化：不在“更多功能”，在建立可持续的“关系契约”",
        paragraphs: [
          "当下的 AI 市场，功能层面的同质化几乎是必然的。但面向生产级的工具，真正的差异化护城河从来不在于“谁接入了更多的 API”或“谁的规划算法更超前”，而在于**系统是否能在复杂多变的现实中，与组织建立起一种极其稳固且具有弹性的“人机关系契约”**。",
          "这套原生贴合的架构不追求用眼花缭乱的功能接管一切，而是恪守三条不可逾越的底线：",
          "1. **主导权的绝对锚定**：AI 永远是原生目录结构的读取者和执行者，它不能也无法越过人类设定的物理文件边界去重构逻辑。",
          "2. **零绑架（Zero Lock-in）**：业务的状态永远以标准文件的形式存在。即使有一天你决定剥离这个 Agent 系统，留下的也是一堆完美组织好的、人类可读的业务资料。",
          "3. **优雅降级能力（Graceful Degradation）**：当系统遇到无法处理的异常时，它不会使整个抽象业务流宕机，而是将阻点清晰地留在特定的文档或目录下，人类随时可以像接手同事未完成的工作一样，无缝接管并继续推进。",
        ],
      },
      {
        title: "权责是基线，动态治理是长期增益",
        paragraphs: [
          "权责与审计是所有业务级 Agent 方案都必须满足的门槛，但仅靠权责不足以形成长久的业务优势。真正的核心价值，在于提供一套**可动态伸缩的渐进式自动化模型**：在低风险、探索性的业务阶段保持极高的上手速度；而在高风险、核心主流程的阶段，又能平滑地叠加人工审批、过程审计、版本回滚等高阶控制点。",
          "团队可以先在熟悉的文件夹里快速跑通一个智能体闭环，再按需逐步增加治理约束，真正实现“先跑起来，再管起来”，而不是被迫“先购买重型平台，再试图验证业务价值”。",
          "在这种架构哲学下，Agent 不再是一个高高在上、让业务人员感到失控与敬畏的黑盒；它理应化作无形的流水，深度渗入团队原有的文档、结构与肌理中，在不强迫人类改变原生语言的前提下，默默完成业务智能的跃升。",
        ],
      },
    ],
  },
  en: {
    badge: "Whitepaper",
    title:
      "When Agents Enter Production: Human Control, Collaboration, and Context",
    epigraph: "Mian man huang niao, zhi yu qiu yu.",
    sections: [
      {
        title: "The Problem We Actually Face",
        paragraphs: [
          "In recent years, agent discussions have converged on one narrative: stronger models, more tools, wider channels, deeper automation. It looks like the only remaining question is capability delta. But once you move from demos to production, the problem changes shape immediately.",
          "The key question is not whether models are smart enough. It is whether teams can still control goals, boundaries, and pace after adopting agents. Many systems assume the same path: rewrite process first, migrate state first, adapt to platform first, then talk about efficiency. Tools begin to define how people work, and people start adapting to the system.",
          "Downcity takes the opposite stance. Humans define goals and boundaries first, then agents amplify execution inside existing engineering context. In practical terms, people decide when to start, stop, and take over, while agents execute at high intensity within defined constraints. Instead of building a full control plane first, teams can start directly from existing repositories and close loops in familiar workflows.",
        ],
      },
      {
        title: "Why the Replacement Narrative Fails in Production",
        paragraphs: [
          "Production is not an empty field waiting for new tooling. It already includes business constraints, team habits, repository semantics, dependency graphs, quality bars, and historical decisions. Agents do not erase this terrain; they must operate within it.",
          "Collaboration boundaries come from whoever defines the environment. Platform-centric approaches often absorb the environment into the platform itself. Teams get capability, but only after migrating semantics and state. Over time this can weaken an organization’s ability to interpret and govern its own context.",
          "“Replace humans” is persuasive in consumer scenarios but usually collapses in production. Production systems are not single tasks. They are continuous processes with cross-cycle coordination, exception handling, and accountability.",
          "When replacement is the objective, systems drift toward black-box encapsulation. That can feel smooth in the short term, but it reduces process visibility. Teams eventually discover they cannot explain decisions quickly enough when something goes wrong.",
          "What production needs is not “Human or Agent,” but “Human with Agent.” Humans own direction and accountability. Agents own execution and acceleration. If that boundary is unclear, stronger automation only increases organizational risk.",
        ],
      },
      {
        title: "Start from Existing Assets, Not from Zero",
        paragraphs: [
          "Downcity’s first principle is not building another platform. It is activating the project you already run. In real teams, the most valuable assets are not just source code: they are configuration habits, collaboration conventions, historical context, task trails, and quality standards.",
          "`ship.json`, `PROFILE.md`, and artifacts in `.ship` are not merely files; they externalize how teams decide, divide work, and review outcomes. Downcity connects these assets into a sustainable execution surface, reducing rollout cost, cognitive burden, and migration friction.",
        ],
      },
      {
        title: "Human Factors: Managing Folders Is Managing Agents",
        paragraphs: [
          "If production agent adoption is a human-computer system design problem, the dominant variable is not model parameters, but cognitive load. Developers are fluent in directories, files, commands, and version history. That path model is the shared language of engineering collaboration.",
          "The most effective way to reduce agent education cost is not another tutorial layer. It is embedding agents into existing engineering paths so managing directories, checking artifacts, and editing config naturally become agent-management actions.",
          "When system state and human mental models are aligned, adoption accelerates. Not because people suddenly become smarter, but because the system does not force them to change language. For individuals and small teams, this alignment is a direct productivity multiplier.",
        ],
      },
      {
        title:
          "The Differentiation of Downcity: Not More Features, More Stable Human-Agent Relations",
        paragraphs: [
          "Many products describe differentiation as feature lists. In production, real differentiation is often encoded in human-agent relations. Downcity prioritizes three fundamentals: human control is not diluted, engineering paths are not forcibly rewritten, and teams can keep iterating without hard dependency on a platform operator.",
          "These priorities may look less flashy, but they decide whether a system can enter daily operation. In production, the biggest risk is not insufficient capability; it is relationship imbalance.",
          "That is why “auditable” and “replayable” are treated as baseline capabilities rather than the core narrative. The deeper question is whether humans and agents can sustain a long-term collaboration model that compounds gains instead of governance cost.",
        ],
      },
    ],
  },
} as const;

export function WhitepaperSection() {
  const { i18n } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [whitepaperCopied, setWhitepaperCopied] = useState(false);
  const [whitepaperCopyFailed, setWhitepaperCopyFailed] = useState(false);
  const isZh = i18n.language === "zh";
  const content = isZh ? WHITEPAPER.zh : WHITEPAPER.en;
  const renderParagraph = (paragraph: string) =>
    paragraph
      .split(/(\*\*[^*]+\*\*)/g)
      .filter((segment) => segment.length > 0)
      .map((segment, index) =>
        segment.startsWith("**") && segment.endsWith("**") ? (
          <strong
            key={`${segment}-${index}`}
            className="font-semibold text-foreground"
          >
            {segment.slice(2, -2)}
          </strong>
        ) : (
          <span key={`${segment}-${index}`}>{segment}</span>
        ),
      );

  const onCopyInstall = () => {
    navigator.clipboard.writeText(INSTALL_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const onCopyWhitepaper = async () => {
    try {
      const response = await fetch(WHITEPAPER_DOWNLOAD_PATH);
      if (!response.ok) {
        throw new Error("Failed to fetch whitepaper markdown");
      }

      const markdown = await response.text();
      await navigator.clipboard.writeText(markdown);
      setWhitepaperCopied(true);
      setWhitepaperCopyFailed(false);
      setTimeout(() => setWhitepaperCopied(false), 1500);
    } catch {
      setWhitepaperCopyFailed(true);
      setTimeout(() => setWhitepaperCopyFailed(false), 1800);
    }
  };

  return (
    <section className="pt-8 pb-6 md:pt-10 md:pb-8">
      <div className="mx-auto w-full max-w-4xl px-4 md:px-6">
        <article className="mx-auto max-w-4xl space-y-12">
          <header className="space-y-5">
            <h1 className="text-balance font-serif text-4xl leading-[1.12] tracking-tight md:text-5xl lg:text-6xl">
              {content.title}
            </h1>
            <blockquote className="w-full">
              <p className="text-pretty font-serif text-base leading-[1.7] text-foreground/72 md:text-lg">
                {content.epigraph}
              </p>
            </blockquote>

            <div className="w-full rounded-md bg-muted/55 px-3 py-2.5">
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5">
                <span className="inline-flex h-6 items-center rounded-sm bg-background/80 px-2 font-mono text-[11px] text-muted-foreground">
                  bash
                </span>
                <code className="overflow-x-auto whitespace-nowrap font-mono text-sm tracking-tight text-foreground">
                  {INSTALL_COMMAND}
                </code>
                <button
                  type="button"
                  onClick={onCopyInstall}
                  className="inline-flex h-7 items-center justify-center gap-1 rounded-sm bg-background/80 px-2.5 text-[11px] font-medium text-foreground/80 transition hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  {copied ? (
                    <>
                      <IconCheck className="h-3.5 w-3.5" />
                      {isZh ? "已复制" : "Copied"}
                    </>
                  ) : (
                    <>
                      <IconCopy className="h-3.5 w-3.5" />
                      {isZh ? "复制" : "Copy"}
                    </>
                  )}
                </button>
              </div>
            </div>
          </header>

          <section className="space-y-10">
            {content.sections.map((section) => (
              <section key={section.title} className="space-y-4">
                <h2 className="font-serif text-3xl leading-tight tracking-tight text-foreground md:text-4xl">
                  {section.title}
                </h2>
                <div className="space-y-4 text-base leading-8 text-muted-foreground md:text-lg">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{renderParagraph(paragraph)}</p>
                  ))}
                </div>
              </section>
            ))}
          </section>

          {/* 白皮书导出操作区：下载原文与复制 Markdown。 */}
          <footer className="flex items-center justify-end gap-2 border-t border-border/40 pt-4">
            <a
              href={WHITEPAPER_DOWNLOAD_PATH}
              download={WHITEPAPER_DOWNLOAD_FILENAME}
              aria-label={isZh ? "下载白皮书 Markdown" : "Download whitepaper Markdown"}
              title={isZh ? "下载 Markdown" : "Download Markdown"}
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "size-9 text-muted-foreground hover:text-foreground",
              )}
            >
              <IconDownload className="size-4" />
            </a>

            <button
              type="button"
              onClick={onCopyWhitepaper}
              aria-label={isZh ? "复制白皮书 Markdown" : "Copy whitepaper Markdown"}
              title={isZh ? "复制 Markdown" : "Copy Markdown"}
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "size-9 text-muted-foreground hover:text-foreground",
              )}
            >
              {whitepaperCopied ? (
                <IconCheck className="size-4" />
              ) : (
                <IconCopy className="size-4" />
              )}
            </button>

            {whitepaperCopyFailed ? (
              <span className="text-xs text-destructive">
                {isZh ? "复制失败" : "Copy failed"}
              </span>
            ) : null}
          </footer>
        </article>
      </div>
    </section>
  );
}

export default WhitepaperSection;
