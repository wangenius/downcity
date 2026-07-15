/**
 * City Session 模型运行时绑定服务。
 *
 * 关键点（中文）
 * - City 负责模型 ID、默认选择、Session 覆盖和实例解析。
 * - Agent SDK 每轮执行前只接收已经解析完成的 LanguageModel 实例。
 * - Session 覆盖从 City 全局数据库读取，外部命令更新后下一轮自动生效。
 */

import type { LanguageModel } from "ai";
import type { AgentSession } from "@downcity/agent";
import { PlatformStore } from "@/city/runtime/store/index.js";

/** City Session 模型运行时构造参数。 */
export interface CitySessionModelRuntimeOptions {
  /** 当前 Agent 项目的绝对根目录。 */
  project_root: string;

  /** 当前 Agent 的默认模型 ID。 */
  default_model_id: string;

  /** 已解析完成的默认运行时模型实例。 */
  default_model: LanguageModel;

  /** 根据 City 模型 ID 创建运行时模型实例。 */
  resolve_model: (model_id: string) => Promise<LanguageModel>;
}

/** City 上游 Session 模型运行时。 */
export class CitySessionModelRuntime {
  private readonly project_root: string;
  private readonly default_model_id: string;
  private readonly resolve_model: CitySessionModelRuntimeOptions["resolve_model"];
  private readonly store = new PlatformStore();
  private readonly models_by_id = new Map<string, LanguageModel>();

  constructor(options: CitySessionModelRuntimeOptions) {
    this.project_root = options.project_root;
    this.default_model_id = String(options.default_model_id || "").trim();
    this.resolve_model = options.resolve_model;
    if (!this.default_model_id) {
      throw new Error("CitySessionModelRuntime requires default_model_id");
    }
    this.models_by_id.set(this.default_model_id, options.default_model);
  }

  /**
   * 在 Session 每轮执行前注入当前生效的模型实例。
   */
  async prepare_session(session: AgentSession): Promise<void> {
    const model_id = this.read_session_model_id(session.id);
    const model = await this.load_model(model_id);
    if (session.config.model === model) return;
    await session.set({ model });
  }

  /** 解析指定 Session 当前生效的运行时模型实例。 */
  async resolve_session_model(session_id: string): Promise<LanguageModel> {
    return await this.load_model(this.read_session_model_id(session_id));
  }

  /** 读取指定 Session 当前生效的 City 模型 ID。 */
  read_session_model_id(session_id: string): string {
    const binding = this.store.get_agent_session_model_binding(
      this.project_root,
      session_id,
    );
    return binding?.model_id || this.default_model_id;
  }

  /** 清理指定 Session 的 City 模型覆盖。 */
  async release_session(session_id: string): Promise<void> {
    this.store.remove_agent_session_model_binding(
      this.project_root,
      session_id,
    );
  }

  /** 关闭运行时持有的 City 存储连接。 */
  dispose(): void {
    this.store.close();
  }

  /** 读取或创建指定 City 模型的运行时实例。 */
  private async load_model(model_id: string): Promise<LanguageModel> {
    const cached = this.models_by_id.get(model_id);
    if (cached) return cached;
    const model = await this.resolve_model(model_id);
    this.models_by_id.set(model_id, model);
    return model;
  }
}

/** 读取指定 Session 的 City 模型覆盖 ID。 */
export function read_session_model_override(
  project_root: string,
  session_id: string,
): string | undefined {
  const store = new PlatformStore();
  try {
    return store.get_agent_session_model_binding(project_root, session_id)
      ?.model_id;
  } finally {
    store.close();
  }
}

/** 写入指定 Session 的 City 模型覆盖 ID。 */
export function write_session_model_override(
  project_root: string,
  session_id: string,
  model_id: string,
): void {
  const store = new PlatformStore();
  try {
    store.upsert_agent_session_model_binding({
      project_root,
      session_id,
      model_id,
    });
  } finally {
    store.close();
  }
}
