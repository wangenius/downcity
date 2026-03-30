/**
 * PromptRuntime：prompt 运行时模块。
 *
 * 关键点（中文）
 * - 统一管理 PROFILE.md / SOUL.md 的加载与热重载。
 * - 仅依赖“当前 systems 读取 + systems 应用”回调，不耦合 AgentRuntime 具体实现。
 */

import { DEFAULT_SHIP_PROMPTS } from "@sessions/prompts/system/SystemDomain.js";
import type { Logger } from "@utils/logger/Logger.js";
import {
  getProfileMdCandidatePaths,
  getProfileMdPath,
  getSoulMdCandidatePaths,
  getSoulMdPath,
} from "@/main/env/Paths.js";
import fs from "fs-extra";
import path from "node:path";
import { watch, type FSWatcher } from "node:fs";

const DEFAULT_HOT_RELOAD_DEBOUNCE_MS = 300;

/**
 * 静态 prompt 文件规范。
 */
type StaticPromptFileSpec = {
  key: "profile" | "soul";
  reloadReason: "profile_md_changed" | "soul_md_changed";
  defaultPath: (rootPath: string) => string;
  candidatePaths: (rootPath: string) => string[];
  fallbackText?: string;
};

const STATIC_PROMPT_FILES: StaticPromptFileSpec[] = [
  {
    key: "profile",
    reloadReason: "profile_md_changed",
    defaultPath: getProfileMdPath,
    candidatePaths: getProfileMdCandidatePaths,
    fallbackText: `# Assistant Role
You are a helpful project assistant.`,
  },
  {
    key: "soul",
    reloadReason: "soul_md_changed",
    defaultPath: getSoulMdPath,
    candidatePaths: getSoulMdCandidatePaths,
  },
];

type StaticPromptProfile = {
  spec: StaticPromptFileSpec;
  resolvedPath: string | null;
  text: string;
};

/**
 * 解析静态 prompt 文件路径（支持候选名）。
 */
function resolveStaticPromptPath(
  rootPath: string,
  spec: StaticPromptFileSpec,
): string | null {
  const candidates = spec.candidatePaths(rootPath);
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * 读取所有静态 prompt 文件。
 */
function loadStaticPromptProfiles(rootPath: string): StaticPromptProfile[] {
  return STATIC_PROMPT_FILES.map((spec) => {
    const resolvedPath = resolveStaticPromptPath(rootPath, spec);
    let text = "";
    if (resolvedPath) {
      try {
        text = fs.readFileSync(resolvedPath, "utf-8").trim();
      } catch {
        text = "";
      }
    }
    if (!text && spec.fallbackText) {
      text = spec.fallbackText;
    }
    return { spec, resolvedPath, text };
  });
}

function buildPathByKey(
  rootPath: string,
  profiles: StaticPromptProfile[],
): Map<string, string> {
  const pathByKey = new Map<string, string>();
  for (const profile of profiles) {
    pathByKey.set(
      profile.spec.key,
      profile.resolvedPath || profile.spec.defaultPath(rootPath),
    );
  }
  return pathByKey;
}

function systemsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * 构建静态系统提示列表。
 */
export function buildStaticSystems(staticProfiles: string[]): string[] {
  return [...staticProfiles, DEFAULT_SHIP_PROMPTS].filter(Boolean);
}

/**
 * 加载当前静态系统提示列表。
 */
export function loadStaticSystems(rootPath: string): string[] {
  const staticProfiles = loadStaticPromptProfiles(rootPath);
  return buildStaticSystems(staticProfiles.map((item) => item.text));
}

type PromptRuntimeOptions = {
  rootPath: string;
  logger: Logger;
  getCurrentSystems: () => string[];
  applySystems: (nextSystems: string[]) => void;
  debounceMs?: number;
};

/**
 * 静态 prompt 热重载器。
 */
export class PromptRuntime {
  private readonly rootPath: string;
  private readonly logger: Logger;
  private readonly getCurrentSystems: PromptRuntimeOptions["getCurrentSystems"];
  private readonly applySystems: PromptRuntimeOptions["applySystems"];
  private readonly debounceMs: number;
  private stopHandle: (() => void) | null = null;

  constructor(options: PromptRuntimeOptions) {
    this.rootPath = options.rootPath;
    this.logger = options.logger;
    this.getCurrentSystems = options.getCurrentSystems;
    this.applySystems = options.applySystems;
    this.debounceMs =
      typeof options.debounceMs === "number" && options.debounceMs > 0
        ? options.debounceMs
        : DEFAULT_HOT_RELOAD_DEBOUNCE_MS;
  }

  /**
   * 停止监听。
   */
  stop(): void {
    if (!this.stopHandle) return;
    this.stopHandle();
    this.stopHandle = null;
  }

  private reloadStaticPromptSystems(reason: string, filename?: string): void {
    const staticProfiles = loadStaticPromptProfiles(this.rootPath);
    const nextSystems = buildStaticSystems(staticProfiles.map((item) => item.text));
    if (systemsEqual(this.getCurrentSystems(), nextSystems)) return;

    this.applySystems(nextSystems);
    const pathByKey = buildPathByKey(this.rootPath, staticProfiles);
    this.logger.info("Static prompts hot reloaded", {
      reason,
      filename: filename || undefined,
      profileMdPath: pathByKey.get("profile") || getProfileMdPath(this.rootPath),
      soulMdPath: pathByKey.get("soul") || getSoulMdPath(this.rootPath),
    });
  }

  /**
   * 启动监听。
   */
  start(): void {
    this.stop();

    const watchers: FSWatcher[] = [];
    const timers = new Map<string, NodeJS.Timeout>();
    const clearAllTimers = (): void => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };

    const schedule = (key: string, task: () => void): void => {
      const prev = timers.get(key);
      if (prev) clearTimeout(prev);
      const next = setTimeout(() => {
        timers.delete(key);
        task();
      }, this.debounceMs);
      timers.set(key, next);
    };

    const attachWatcher = (
      watchPath: string,
      options: { recursive?: boolean },
      onChange: (eventType: string, filename: string) => void,
    ): boolean => {
      try {
        const watcher = watch(
          watchPath,
          { recursive: Boolean(options.recursive) },
          (eventType, filename) => {
            const normalized = filename
              ? Buffer.isBuffer(filename)
                ? filename.toString("utf-8")
                : String(filename)
              : "";
            onChange(eventType, normalized);
          },
        );
        watcher.on("error", (error) => {
          this.logger.warn("Hot reload watcher runtime error", {
            watchPath,
            error: String(error),
          });
        });
        watchers.push(watcher);
        return true;
      } catch (error) {
        this.logger.warn("Hot reload watcher attach failed", {
          watchPath,
          error: String(error),
        });
        return false;
      }
    };

    const staticPromptFileNameToReason = new Map<string, string>();
    for (const spec of STATIC_PROMPT_FILES) {
      for (const candidatePath of spec.candidatePaths(this.rootPath)) {
        staticPromptFileNameToReason.set(
          path.basename(candidatePath),
          spec.reloadReason,
        );
      }
    }

    // PROFILE.md / SOUL.md：监听项目根目录（文件替换/重命名也能捕获）。
    attachWatcher(this.rootPath, {}, (_eventType, filename) => {
      const basename = filename ? path.basename(filename) : "";
      const changedReason = staticPromptFileNameToReason.get(basename);
      if (!changedReason) return;
      schedule("static-prompts", () =>
        this.reloadStaticPromptSystems(changedReason, basename),
      );
    });

    const staticProfiles = loadStaticPromptProfiles(this.rootPath);
    const pathByKey = buildPathByKey(this.rootPath, staticProfiles);

    this.stopHandle = () => {
      clearAllTimers();
      for (const watcher of watchers) {
        try {
          watcher.close();
        } catch {
          // ignore
        }
      }
    };

    this.logger.info("Runtime hot reload enabled", {
      profileMdPath: pathByKey.get("profile") || getProfileMdPath(this.rootPath),
      soulMdPath: pathByKey.get("soul") || getSoulMdPath(this.rootPath),
      watchers: watchers.length,
    });
  }
}
