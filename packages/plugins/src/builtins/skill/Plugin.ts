/**
 * Skill Plugin。
 *
 * 关键点（中文）
 * - skill 不再作为 service 存在，而是作为显式 action + system 提供者接入 plugin 体系。
 * - `find/install/list/lookup` 全部通过 plugin actions 暴露。
 * - skills overview 文本通过 `plugin.system` 注入，不再依赖 plugin.system。
 */

import type { AgentRuntime } from "@downcity/agent/internal/types/runtime/agent/AgentRuntime.js";
import { BasePlugin } from "@downcity/agent/internal/plugin/core/BasePlugin.js";
import type { Plugin } from "@downcity/agent/internal/plugin/types/Plugin.js";
import type { JsonObject, JsonValue } from "@downcity/agent/internal/types/common/Json.js";
import { isPluginEnabled } from "@downcity/agent/internal/plugin/core/Activation.js";
import type {
  SkillPluginFindPayload,
  SkillPluginInstallPayload,
  SkillPluginLookupPayload,
} from "@/builtins/skill/types/SkillPlugin.js";
import { SKILL_PLUGIN_ACTIONS } from "@/builtins/skill/types/SkillPlugin.js";
import {
  DEFAULT_SKILL_PLUGIN_CONFIG,
  readSkillPluginConfig,
} from "@/builtins/skill/Config.js";
import { skillFindCommand, skillInstallCommand } from "@/builtins/skill/Command.js";
import {
  findLearnedSkillExact,
  listSkills,
  lookupSkill,
  searchLearnedSkills,
} from "@/builtins/skill/Action.js";
import { buildSkillsSystemText } from "@/builtins/skill/runtime/SystemProvider.js";
import { SKILL_PLUGIN_PROMPT } from "@/builtins/skill/SkillPromptAssets.js";

/**
 * 读取 JSON object。
 */
function readJsonObject(value: JsonValue): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid JSON body");
  }
  return value as JsonObject;
}

/**
 * 读取字符串选项。
 */
function getStringOpt(
  opts: Record<string, JsonValue>,
  key: string,
): string | undefined {
  const value = opts[key];
  return typeof value === "string" ? value.trim() : undefined;
}

/**
 * 读取布尔选项。
 */
function getBooleanOpt(
  opts: Record<string, JsonValue>,
  key: string,
): boolean | undefined {
  const value = opts[key];
  return typeof value === "boolean" ? value : undefined;
}

/**
 * XML 属性转义。
 */
function sanitizeXmlAttr(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * 从 install spec 推断候选 skill 标识。
 */
function inferSkillQueryFromSpec(spec: string): string {
  const raw = String(spec || "").trim();
  if (!raw) return "";
  const normalized = raw.split(/[?#]/, 1)[0]?.trim() || raw;

  const atIndex = normalized.lastIndexOf("@");
  if (atIndex > 0 && atIndex < normalized.length - 1) {
    return normalized.slice(atIndex + 1).trim();
  }

  if (!normalized.includes("/")) return normalized;
  return "";
}

function createSkillPluginDefinition(plugin: Plugin): Plugin {
  return {
    name: "skill",
  title: "Skill Catalog And Loader",
  description:
    "Finds, installs, lists, and reads local skills, and injects the current skill overview into system prompts so the agent knows what capabilities are available.",
  config: {
    plugin: "skill",
    scope: "project",
    defaultValue: {
      ...DEFAULT_SKILL_PLUGIN_CONFIG,
    },
  },
  availability(context) {
    if (!isPluginEnabled({ plugin, context })) {
      return {
        enabled: false,
        available: false,
        reasons: ["skill plugin disabled in project config"],
      };
    }
    return {
      enabled: true,
      available: true,
      reasons: [],
    };
  },
  async system(context) {
    const dynamicText = String(await buildSkillsSystemText(context)).trim();
    return [SKILL_PLUGIN_PROMPT, dynamicText].filter(Boolean).join("\n\n");
  },
  actions: {
    [SKILL_PLUGIN_ACTIONS.find]: {
      command: {
        description: "查找 `list` 中不存在的未学会 skills（缺失时再 install）",
        configure(command) {
          command.argument("<query>");
        },
        mapInput({ args }): SkillPluginFindPayload {
          const query = String(args[0] || "").trim();
          if (!query) throw new Error("Missing query");
          return { query };
        },
      },
      async execute(params) {
        const payload = params.payload as SkillPluginFindPayload;
        const rootPath = params.context.rootPath;
        const exactLearned = findLearnedSkillExact(rootPath, payload.query);
        if (exactLearned) {
          return {
            success: true,
            data: {
              query: payload.query,
              message: "该技能已在 list 中，无需 install。使用前请先执行 lookup。",
              workflow: ["list", "lookup"],
              nextAction: "lookup",
              learnedSkill: exactLearned,
              learnedHints: [],
            },
          };
        }

        const learnedHints = searchLearnedSkills(rootPath, payload.query, 5);
        await skillFindCommand(payload.query);
        return {
          success: true,
          data: {
            query: payload.query,
            message: "已执行缺失技能检索；若目标不在 list 中，可 install 后再 lookup。",
            workflow: ["find", "install", "lookup"],
            nextAction: "install",
            learnedSkill: null,
            learnedHints,
          },
        };
      },
    },
    [SKILL_PLUGIN_ACTIONS.install]: {
      command: {
        description: "安装 `list` 中不存在的 skill（完成后请先 lookup）",
        configure(command) {
          command
            .argument("<spec>")
            .option("-g, --global", "全局安装（默认 true）", true)
            .option("-y, --yes", "跳过确认（默认 true）", true)
            .option("--agent <agent>", "指定 agent", "claude-code");
        },
        mapInput({ args, opts }): SkillPluginInstallPayload {
          const spec = String(args[0] || "").trim();
          if (!spec) throw new Error("Missing spec");
          return {
            spec,
            global: getBooleanOpt(opts, "global"),
            yes: getBooleanOpt(opts, "yes"),
            agent: getStringOpt(opts, "agent"),
          };
        },
      },
      async execute(params) {
        const payload = params.payload as SkillPluginInstallPayload;
        const rootPath = params.context.rootPath;
        const queryFromSpec = inferSkillQueryFromSpec(payload.spec);
        const beforeList = listSkills(rootPath).skills;
        const beforeIds = new Set(beforeList.map((item) => item.id));

        const learnedBefore =
          findLearnedSkillExact(rootPath, queryFromSpec) ||
          findLearnedSkillExact(rootPath, payload.spec);
        if (learnedBefore) {
          return {
            success: true,
            data: {
              spec: payload.spec,
              skipped: true,
              message: "技能已在 list 中，无需 install。使用前请先执行 lookup。",
              workflow: ["list", "lookup"],
              nextAction: "lookup",
              queryFromSpec,
              addedSkills: [],
              learnedSkill: learnedBefore,
            },
          };
        }

        await skillInstallCommand(payload.spec, {
          global: payload.global,
          yes: payload.yes,
          agent: payload.agent,
        });
        const afterList = listSkills(rootPath).skills;
        const addedSkills = afterList.filter((item) => !beforeIds.has(item.id));
        const learnedAfter =
          findLearnedSkillExact(rootPath, queryFromSpec) ||
          findLearnedSkillExact(rootPath, payload.spec) ||
          (addedSkills.length === 1 ? addedSkills[0] : undefined);

        return {
          success: true,
          data: {
            spec: payload.spec,
            message: "技能学习完成。使用技能前请先执行 lookup 读取该技能的 SKILL.md 内容。",
            workflow: ["find", "install", "lookup"],
            nextAction: "lookup",
            skipped: false,
            queryFromSpec,
            addedSkills,
            learnedSkill: learnedAfter || null,
          },
        };
      },
    },
    [SKILL_PLUGIN_ACTIONS.list]: {
      command: {
        description: "列出当前已学会（本地可发现）的 skills",
        mapInput() {
          return {};
        },
      },
      api: {
        method: "GET",
      },
      execute(params) {
        return {
          success: true,
          data: listSkills(params.context.rootPath),
        };
      },
    },
    [SKILL_PLUGIN_ACTIONS.lookup]: {
      command: {
        description: "读取已学会 skill 内容（SKILL.md）",
        configure(command) {
          command.argument("<name>");
        },
        mapInput({ args }): SkillPluginLookupPayload {
          const name = String(args[0] || "").trim();
          if (!name) throw new Error("Missing name");
          return { name };
        },
      },
      api: {
        method: "POST",
        async mapInput(c): Promise<SkillPluginLookupPayload> {
          const body = readJsonObject(await c.req.json());
          const name = String(body.name || "").trim();
          if (!name) throw new Error("Missing name");
          return { name };
        },
      },
      async execute(params) {
        const payload = params.payload as SkillPluginLookupPayload;
        const result = await lookupSkill({
          projectRoot: params.context.rootPath,
          request: {
            name: payload.name,
          },
        });
        if (!result.success) {
          return {
            success: false,
            error: result.error || "skill lookup failed",
          };
        }

        const skillName = String(result.skill?.name || result.skill?.id || "").trim();
        const openingTag = skillName
          ? `<skill name="${sanitizeXmlAttr(skillName)}">`
          : "<skill>";
        const skillUserMessage = [
          openingTag,
          String(result.content || "").trim(),
          "</skill>",
        ]
          .filter(Boolean)
          .join("\n")
          .trim();

        return {
          success: true,
          data: {
            success: true,
            ...(result.skill ? { skill: result.skill } : {}),
            message: "技能内容已准备，下一步将以 `<skill>...</skill>` user message 注入。",
            __ship: {
              injectUserMessages: [
                {
                  text: skillUserMessage,
                  note: "skill_lookup",
                },
              ],
              suppressToolOutput: true,
              toolOutputMessage:
                "skill lookup success; content injected as <skill> user message.",
            },
          },
        };
      },
    },
  },
  };
}

/**
 * SkillPlugin：技能发现、安装、读取与 system 注入。
 */
export class SkillPlugin extends BasePlugin {
  readonly name = "skill";

  constructor(agent: AgentRuntime | null = null) {
    super(agent);
    Object.assign(this, createSkillPluginDefinition(this));
  }
}
