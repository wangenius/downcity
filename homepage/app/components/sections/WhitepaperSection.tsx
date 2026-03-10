import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  IconCheck,
  IconCopy,
  IconDownload,
} from "@tabler/icons-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const INSTALL_COMMAND = "npm i -g shipmyagent";
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
          "这几年，围绕 Agent 的讨论常常被带到同一个方向：模型更强了、工具更多了、入口更广了、自动化更深了。看上去，问题只剩下“还差多少能力”。但只要把场景从演示台切回生产现场，问题就会立刻变形。",
          "关键问题从来不是“模型是否更聪明”，而是“团队在引入 Agent 之后，是否还能保持对目标、边界和节奏的控制”。很多系统默认了一条路径：先改流程、先迁状态、先适配平台，再谈效率。结果是，工具开始定义人的工作方式，人反而要迁就系统。短期看似更先进，长期却经常把团队带进一个悖论：能力更强了，掌控感更弱了。",
          "ShipMyAgent 的命题正好反过来。不是先让组织迁移到新范式，再学习如何和 Agent 共处；而是由人先定义目标与边界，让 Agent 在现有工程语境中放大执行能力。换言之，它试图把“止”落成一种工程秩序：人决定何时启动、何时中止、何时接管，Agent 在被定义过的语境中高强度执行，而不是反过来定义人的工作方式。不是先搭一个完整控制平面，再把业务装进去；而是从已有仓库直接启动，在熟悉流程里先跑通闭环，让个人与小团队先形成稳定生产力。",
        ],
      },
      {
        title: "为什么“替代叙事”在生产里经常失效",
        paragraphs: [
          "“丘隅”不是一个地理角落，也不只是某个硬件或某个入口。对生产系统而言，丘隅更接近一种“早已存在的环境”：业务目标与约束、团队已有的工作路径、代码仓库沉淀的语义、依赖关系与质量标准，以及那些无法被一句提示词抹平的历史与上下游。这些东西不会因为你引入了 Agent 而消失；它们恰恰构成了生产的真实地形。承认这一点，意味着你接受一个事实：Agent 不是来重新发明世界的，它只能在既有纹理里行动。",
          "当我们谈人和 Agent 的协作方式，重点也不应是行政式的权责表，而是先回答一个更根本的问题：谁来定义环境，谁就定义了协作的边界。很多平台型方案的隐含前提，是把环境收编进平台，让平台成为新的“丘隅”；人为了获得能力，先迁移语义与状态。看似统一，实则把组织的行动边界外包给了工具，久而久之，团队对自身环境的解释权会被稀释。生产里最危险的不是偶尔出错，而是“错误在陌生语境里发生”：团队既不熟悉地形，也难以及时止步。",
          "关于 Agent，最有诱惑力的一句话是“替代人”。这句话在消费场景里有传播力，在生产场景里却常常不成立。不是因为模型不够强，而是因为生产系统不是单点任务。它是连续过程，是跨周期协作，是质量约束、上下游依赖、异常处理、责任承担共同作用的结果。一个 Agent 也许能完成某一步，但“稳定承担整条链路”是另一件事。",
          "当系统以替代为目标时，往往会天然追求封装：尽量隐藏复杂度，尽量减少人工介入，尽量把路径做成黑箱。这在短期体验上很顺滑，但会带来长期问题。团队会逐渐失去对过程的感知，直到某个关键时刻才发现自己并不知道系统为什么这样做、哪里出了偏差、该如何快速纠正。于是效率提升和治理能力之间出现剪刀差，最后是人被迫接管残局，而不是系统稳定协同。",
          "生产环境真正需要的不是“Human or Agent”，而是“Human with Agent”。人负责方向、判断与责任，Agent 负责执行、扩展与加速。这不是道德宣言，而是工程现实。谁定义目标、谁决定边界、谁承担后果，必须始终明确。只要这件事模糊，再强的自动化都可能变成组织风险。",
        ],
      },
      {
        title: "从已有资产出发，而不是从零开始",
        paragraphs: [
          "ShipMyAgent 的第一原则，不是“再造一个平台”，而是“激活你已经在用的项目”。因为在真实团队里，最有价值的资产从来不只是代码本身，还包括配置习惯、协作约定、历史上下文、任务痕迹、质量标准。仓库不是一个等待被替代的旧系统，它本身就是组织知识与执行轨迹的沉淀层。",
          "`ship.json`、`PROFILE.md`、`.ship` 中的消息与任务产物，表面看是文件，实质上是团队如何做决策、如何分工、如何复盘的外化结构。ShipMyAgent 要做的，不是把这些资产搬运到另一个世界，而是把它们连接成一个可持续运行的执行面。这样做的价值非常直接：上线成本更低，认知负担更小，迁移阻力更弱。个人开发者和小团队不需要先成立“平台改造项目”，就能在现有流程里快速落地，并在真实使用中持续迭代。",
        ],
      },
      {
        title: "人因工程的关键：管理文件夹，本质上就是管理 Agent",
        paragraphs: [
          "如果把 Agent 落地看成一次人机协作系统设计，那么最重要的变量不是模型参数，而是人的认知负载。开发者真正熟悉的不是某个专有控制台，而是目录、文件、命令、版本。这套路径模型经过几十年工程实践，已经成为团队协作的共同语言。谁都能读，谁都能改，谁都能交接。",
          "所以“降低 Agent 教育成本”最有效的方法，不是再做一层教程，而是让 Agent 直接嵌入这套既有路径。让管理目录、查看产物、修改配置这些原本就在发生的动作，直接等价为管理 Agent 的动作。这样，团队并不是在学习一套新规则，而是在延续一套旧能力。你不是先学会“如何管理平台里的 Agent”，你是在日常工程动作中自然管理 Agent。",
          "当系统状态和人的心智结构同构时，组织吸收速度会显著提升。不是因为人变聪明了，而是因为系统没有强迫人改语言。对个人和小团队尤其如此：他们没有多余预算去做长期培训，也没有独立平台团队去维护复杂抽象。路径贴合本身就是生产力。",
        ],
      },
      {
        title: "ShipMyAgent 的差异化，不在“更多功能”，在“更稳关系”",
        paragraphs: [
          "很多产品差异化都写在能力清单上，但生产级差异化往往写在人机关系里。ShipMyAgent 的区别，不是它做了别人完全做不到的事，而是它优先稳定了三件更基础的事：人的主导权不被稀释，工程路径不被强制重写，团队可以在不依赖平台方的情况下持续迭代。",
          "这三件事看起来不“炫”，却决定了系统能否进入日常。因为生产场景最怕的不是能力不足，而是关系失衡。只要关系稳，能力可以逐步补齐；关系不稳，能力越多，风险越大。",
          "这也是为什么我们不把“可审计、可复盘”当作独占卖点。它们当然重要，但已经是现代 Agent 系统应有的基础能力，不应被误当作核心叙事。真正的差异化，应回到更难、也更实在的问题：人和 Agent 是否建立了一个长期可持续的协作关系，团队是否能在这个关系中持续获得增益而不是持续付出治理成本。",
        ],
      },
      {
        title: "补充：权责是生产基线，动态管理才是关键增益",
        paragraphs: [
          "权责问题确实重要，但它是所有生产级 Agent 方案都必须满足的门槛，而不是单独强调就能形成差异化。对 ShipMyAgent 来说，更核心的价值在于提供一套可动态调整的管理模型：在低风险阶段保持高上手速度，在高风险阶段逐步提升治理强度。",
          "这种动态性体现在“同一套系统、不同阶段、不同管理强度”的连续调节能力，而不是二选一。团队可以先快速跑通闭环，再按风险和规模增加审批、审计、回滚等控制点，实现“先用起来，再管起来”，而不是“先重构治理，再尝试落地”。",
          "因此，ShipMyAgent 强调的不是“我们也做权责”，而是“我们让管理能力可以跟随业务阶段动态调整”，同时兼顾上手速度和生产可控性。",
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
          "ShipMyAgent takes the opposite stance. Humans define goals and boundaries first, then agents amplify execution inside existing engineering context. In practical terms, people decide when to start, stop, and take over, while agents execute at high intensity within defined constraints. Instead of building a full control plane first, teams can start directly from existing repositories and close loops in familiar workflows.",
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
          "ShipMyAgent’s first principle is not building another platform. It is activating the project you already run. In real teams, the most valuable assets are not just source code: they are configuration habits, collaboration conventions, historical context, task trails, and quality standards.",
          "`ship.json`, `PROFILE.md`, and artifacts in `.ship` are not merely files; they externalize how teams decide, divide work, and review outcomes. ShipMyAgent connects these assets into a sustainable execution surface, reducing rollout cost, cognitive burden, and migration friction.",
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
          "The Differentiation of ShipMyAgent: Not More Features, More Stable Human-Agent Relations",
        paragraphs: [
          "Many products describe differentiation as feature lists. In production, real differentiation is often encoded in human-agent relations. ShipMyAgent prioritizes three fundamentals: human control is not diluted, engineering paths are not forcibly rewritten, and teams can keep iterating without hard dependency on a platform operator.",
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
                    <p key={paragraph}>{paragraph}</p>
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
