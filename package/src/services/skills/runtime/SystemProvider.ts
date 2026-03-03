import fs from "fs-extra";
import path from "node:path";
import { requestContext } from "@/main/service/RequestContext.js";
import type { ServiceRuntime } from "@/main/service/ServiceRuntime.js";
import type { ServiceSystemBuilder } from "@main/service/ServiceRegistry.js";
import type { LoadedSkillV1 } from "@services/skills/types/LoadedSkill.js";
import { discoverClaudeSkillsSync } from "./Discovery.js";
import { renderClaudeSkillsPromptSection } from "./Prompt.js";
import { buildLoadedSkillsSystemText } from "./ActiveSkillsPrompt.js";
import {
  setContextAvailableSkills,
  setContextLoadedSkills,
} from "./Store.js";
import type { JsonValue } from "@/types/Json.js";

/**
 * 归一化 allowed tools。
 *
 * 关键点（中文）
 * - 去空值 + 去重，保证技能信息输出稳定。
 */
function normalizeAllowedTools(input: JsonValue | undefined): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const item of input) {
    const value = String(item || "").trim();
    if (!value) continue;
    out.push(value);
  }
  return Array.from(new Set(out));
}

/**
 * 将 discovered skill + 文件内容转为 loaded skill 结构。
 */
function toLoadedSkill(params: {
  projectRoot: string;
  id: string;
  name: string;
  skillMdPath: string;
  allowedTools: JsonValue | undefined;
  content: string;
}): LoadedSkillV1 {
  return {
    id: params.id,
    name: params.name,
    skillMdPath: path.relative(params.projectRoot, params.skillMdPath),
    content: params.content,
    allowedTools: normalizeAllowedTools(params.allowedTools),
  };
}

function getCurrentContextId(): string {
  const request = requestContext.getStore();
  return String(request?.contextId || "").trim();
}

/**
 * 构建 skills system 文本。
 *
 * 算法流程（中文）
 * 1) 发现可用 skills 并生成 overview 段落
 * 2) 若存在 contextId，则读取 pinnedSkillIds 并装载 SKILL.md
 * 3) 清理失效 pin 并更新 runtime 状态快照
 * 4) 将 overview + active skills 文本合并为最终 system
 */
async function buildSkillsSystemText(
  getContext: () => ServiceRuntime,
): Promise<string> {
  const runtime = getContext();
  const contextId = getCurrentContextId();
  const discoveredSkills = discoverClaudeSkillsSync(runtime.rootPath, runtime.config);
  if (contextId) {
    setContextAvailableSkills(contextId, discoveredSkills);
  }

  const sections: string[] = [];
  const skillsOverview = renderClaudeSkillsPromptSection(
    runtime.rootPath,
    runtime.config,
    discoveredSkills,
  ).trim();
  if (skillsOverview) {
    sections.push(skillsOverview);
  }

  if (!contextId) {
    return sections.join("\n\n").trim();
  }

  const loadedSkillsById = new Map<string, LoadedSkillV1>();
  const contextStore = runtime.context.getContextStore(contextId);
  try {
    const meta = await contextStore.loadMeta();
    const pinnedSkillIds = Array.isArray(meta.pinnedSkillIds)
      ? meta.pinnedSkillIds
      : [];
    if (pinnedSkillIds.length > 0) {
      const byId = new Map(discoveredSkills.map((skill) => [skill.id, skill]));
      const loadedIds: string[] = [];

      for (const rawId of pinnedSkillIds) {
        const id = String(rawId || "").trim();
        if (!id) continue;
        const discovered = byId.get(id);
        if (!discovered) continue;

        let content = "";
        try {
          content = String(await fs.readFile(discovered.skillMdPath, "utf-8")).trim();
        } catch {
          content = "";
        }
        if (!content) continue;

        const loadedSkill = toLoadedSkill({
          projectRoot: runtime.rootPath,
          id: discovered.id,
          name: discovered.name,
          skillMdPath: discovered.skillMdPath,
          allowedTools: discovered.allowedTools,
          content,
        });
        loadedIds.push(loadedSkill.id);
        loadedSkillsById.set(loadedSkill.id, loadedSkill);
      }

      const normalizedInput = Array.from(
        new Set(
          pinnedSkillIds
            .map((item) => String(item || "").trim())
            .filter(Boolean),
        ),
      );
      const normalizedLoaded = Array.from(new Set(loadedIds));
      if (normalizedInput.length !== normalizedLoaded.length) {
        await contextStore.setPinnedSkillIds(normalizedLoaded);
      }
    }
  } catch {
    // ignore
  } finally {
    // 关键点（中文）：core 不保存技能业务状态；状态快照在 skills service 内维护。
    setContextLoadedSkills(contextId, loadedSkillsById);
  }

  const activeSkillsSystem = buildLoadedSkillsSystemText({
    loaded: loadedSkillsById,
  });
  if (activeSkillsSystem) {
    sections.push(activeSkillsSystem);
  }

  return sections.join("\n\n").trim();
}

/**
 * skills service system 构建器。
 *
 * 关键点（中文）
 * - service 暴露单一 `system` 字段：`() => string`
 * - 运行时每次请求前调用，拿到当前会话的 skills system 文本
 */
export function createSkillsSystemBuilder(
  getContext: () => ServiceRuntime,
): ServiceSystemBuilder {
  return () => buildSkillsSystemText(getContext);
}
