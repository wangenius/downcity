import { embed, EmbeddingModel } from "ai";
import { ChromaClient, Collection, Where } from "chromadb";
import { Volume } from "./Volume.js";

/**
 * Codex 配置选项
 */
export interface CodexConfig {
  model: EmbeddingModel;
  path?: string;
}

/**
 * Codex 类，用于管理和检索向量化信息。
 * 内部使用 ChromaDB 进行数据存储。
 * codex.volume().
 */
export class Codex {
  private volumes: Record<string, Volume>;
  private client: ChromaClient;
  private model: EmbeddingModel;

  private constructor(config: CodexConfig) {
    this.client = new ChromaClient({
      path: "http://localhost:8000",
    });
    this.model = config?.model;
    this.volumes = {};
  }

  /**
   * 创建并初始化一个 Codex 实例。
   * @param config - Codex 配置
   * @returns 一个初始化的 Codex 实例
   */
  public static async create(config: CodexConfig): Promise<Codex> {
    const codex = new Codex(config);
    return codex;
  }

  list() {
    return this.client.listCollections();
  }

  async volume(name: string) {
    if (!this.volumes[name]) {
      const collection = await this.client.createCollection({
        name,
      });
      console.log("collection created");

      this.volumes[name] = new Volume(collection, this.model);
    }
    return this.volumes[name];
  }
}
