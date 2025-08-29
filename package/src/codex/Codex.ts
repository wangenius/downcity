import { connect, Connection, Table } from "@lancedb/lancedb";
import { embed, EmbeddingModel } from "ai";
import { homedir } from "os";
import z from "zod";
import { skill } from "../skill/Skill.js";
import {
  Field,
  Int32,
  Schema,
  Utf8,
  Float32,
  FixedSizeList,
} from "apache-arrow";

/**
 * Codex 配置选项
 * 用于初始化 Codex 实例的配置参数
 */
export interface CodexConfig {
  /** 嵌入模型，用于将文本转换为向量 */
  model: EmbeddingModel;
  /** 数据库存储路径，可选，默认为 ~/.downcity/codex/lancedb */
  path?: string;
  /** 表名，默认为 'knowledge' */
  tableName?: string;
  /** 向量维度，可选，如果不提供将自动检测 */
  vectorDimension?: number;
}

/**
 * 搜索选项
 */
export interface SearchOptions {
  /** 返回的最相似结果数量，默认为5 */
  limit?: number;
  /** 用于过滤元数据的条件 */
  where?: Record<string, any>;
  /** 距离阈值，只返回相似度距离小于此值的结果 */
  distanceThreshold?: number;
}

/**
 * 搜索结果
 */
export interface SearchResult {
  /** 数据项的唯一标识符 */
  id: string;
  /** 原始文本内容 */
  content: string;
  /** 存储的元数据信息 */
  metadata: Record<string, any>;
  /** 与查询向量的距离，值越小表示越相似 */
  distance: number;
}

/**
 * 批量嵌入参数
 */
export interface BatchEmbeddingItem {
  /** 要向量化的文本内容，不能为空 */
  content: string;
  /** 可选的元数据，用于存储额外信息和后续过滤 */
  metadata?: Record<string, any>;
  /** 可选的自定义ID，如果不提供会自动生成UUID */
  id?: string;
}

/**
 * Codex 类，用于管理和检索向量化信息。
 * 内部使用 LanceDB 进行数据存储。
 * 简化版本，直接使用单一表结构。
 */
export class Codex {
  private db: Connection | null = null;
  private table: Table | null = null;
  private model: EmbeddingModel;
  private config: CodexConfig;
  private initPromise: Promise<void> | null = null;
  private vectorDimension: number | null = null;

  /**
   * 构造函数
   * @param config - Codex配置对象，包含模型和存储路径等信息
   */
  constructor(config: CodexConfig) {
    if (!config.model) {
      throw "model is required in config";
    }

    this.config = config;
    this.model = config.model;
  }

  /**
   * 创建一个 Codex 实例（同步）
   * 这是推荐的创建方式，支持延迟初始化数据库连接
   * @param config - Codex配置对象
   * @param config.model - 嵌入模型，用于文本向量化
   * @param config.path - 可选的数据库存储路径
   * @returns 新创建的 Codex 实例
   */
  public static create(config: CodexConfig): Codex {
    return new Codex(config);
  }

  /**
   * 动态检测向量维度
   */
  private async detectVectorDimension(): Promise<number> {
    if (this.vectorDimension !== null) {
      return this.vectorDimension;
    }

    // 如果配置中指定了维度，直接使用
    if (this.config.vectorDimension) {
      this.vectorDimension = this.config.vectorDimension;
      return this.vectorDimension;
    }

    // 通过测试embedding来检测维度
    try {
      const { embedding } = await embed({
        model: this.model,
        value: "test", // 使用简单的测试文本
      });
      this.vectorDimension = embedding.length;
      return this.vectorDimension;
    } catch (error) {
      throw new Error(`Failed to detect vector dimension: ${error}`);
    }
  }

  /**
   * 验证现有表的向量维度是否与当前模型匹配
   */
  private async validateTableVectorDimension(): Promise<void> {
    if (!this.table) {
      throw new Error("Table not initialized");
    }

    const currentDimension = await this.detectVectorDimension();

    // 获取表的schema信息
    const schema = await this.table.schema();
    const vectorField = schema.fields.find(
      (field: any) => field.name === "vector"
    );

    if (vectorField && vectorField.type instanceof FixedSizeList) {
      const tableDimension = vectorField.type.listSize;

      if (tableDimension !== currentDimension) {
        throw new Error(
          `Vector dimension mismatch: table has ${tableDimension} dimensions, ` +
            `but current model outputs ${currentDimension} dimensions. ` +
            `Please use a different table name or update your model configuration.`
        );
      }
    }
  }

  /**
   * 延迟初始化数据库连接
   */
  private async ensureInitialized(): Promise<void> {
    if (this.db) return;

    if (!this.initPromise) {
      this.initPromise = this.initializeDb();
    }
    await this.initPromise;
  }

  private async initializeDb(): Promise<void> {
    this.db = await connect(
      this.config.path || homedir() + "/.downcity/codex/lancedb"
    );

    const tableName = this.config.tableName || "knowledge";
    try {
      this.table = await this.db.openTable(tableName);

      // 验证现有表的向量维度
      await this.validateTableVectorDimension();
    } catch (error) {
      // 动态检测向量维度
      const dimension = await this.detectVectorDimension();

      // 创建新表
      const schema = new Schema([
        new Field("id", new Utf8()),
        new Field("content", new Utf8()),
        new Field("metadata", new Utf8()),
        new Field(
          "vector",
          new FixedSizeList(dimension, new Field("item", new Float32()))
        ),
      ]);
      this.table = await this.db.createEmptyTable(tableName, schema);
    }
  }

  /**
   * 关闭数据库连接并清理资源。
   */
  close(): void {
    if (this.db) {
      this.db.close();
    }
  }

  /**
   * 检查连接是否有效。
   * @returns 连接状态
   */
  private async checkConnection(): Promise<Connection> {
    await this.ensureInitialized();
    if (!this.db) {
      throw new Error("Codex not initialized");
    }
    return this.db;
  }

  /**
   * 检查表是否已初始化
   */
  private async ensureTableInitialized(): Promise<Table> {
    await this.ensureInitialized();
    if (!this.table) {
      throw new Error("Table not initialized");
    }
    return this.table;
  }

  /**
   * 添加文本内容到知识库
   * @param content - 要存储的文本内容
   * @param metadata - 可选的元数据
   * @returns Promise<string> - 生成的唯一ID
   */
  async add(content: string, metadata?: Record<string, any>): Promise<string> {
    if (!content || typeof content !== "string") {
      throw new Error("Content must be a non-empty string");
    }

    const table = await this.ensureTableInitialized();
    const { embedding } = await embed({
      model: this.model,
      value: content,
    });

    const id = crypto.randomUUID();
    const data = {
      id,
      content,
      metadata: JSON.stringify(metadata || {}),
      vector: embedding,
    };

    await table.add([data]);
    return id;
  }

  /**
   * 批量添加文本内容
   * @param items - 要批量处理的数据项数组
   * @returns Promise<string[]> - 生成的ID列表
   */
  async batchAdd(items: BatchEmbeddingItem[]): Promise<string[]> {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Items must be a non-empty array");
    }

    const table = await this.ensureTableInitialized();
    const batchData = [];
    const ids = [];

    for (const item of items) {
      if (!item.content || typeof item.content !== "string") {
        throw new Error("Each item must have a non-empty content string");
      }

      const { embedding } = await embed({
        model: this.model,
        value: item.content,
      });

      const id = item.id || crypto.randomUUID();
      batchData.push({
        id,
        content: item.content,
        metadata: JSON.stringify(item.metadata || {}),
        vector: embedding,
      });
      ids.push(id);
    }

    await table.add(batchData);
    return ids;
  }

  /**
   * 搜索相似内容
   * @param query - 查询文本
   * @param options - 搜索选项
   * @returns Promise<SearchResult[]> - 搜索结果
   */
  async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    if (!query || typeof query !== "string") {
      throw new Error("Query must be a non-empty string");
    }

    const table = await this.ensureTableInitialized();
    const { limit = 5, distanceThreshold } = options;

    const { embedding } = await embed({
      model: this.model,
      value: query,
    });

    let searchQuery = table.search(embedding).limit(limit);
    const results = await searchQuery.toArray();

    // 过滤距离阈值
    let filteredResults = results;
    if (distanceThreshold !== undefined) {
      filteredResults = results.filter(
        (result: any) => result._distance <= distanceThreshold
      );
    }

    return filteredResults.map((result: any) => ({
      id: result.id,
      content: result.content,
      metadata: JSON.parse(result.metadata || "{}"),
      distance: result._distance,
    }));
  }

  /**
   * 根据类型搜索
   * @param query - 查询文本
   * @param type - 类型过滤条件
   * @param limit - 返回结果数量
   * @returns Promise<SearchResult[]> - 搜索结果
   */
  async searchByType(
    query: string,
    type: string,
    limit: number = 5
  ): Promise<SearchResult[]> {
    const results = await this.search(query, { limit });
    return results.filter((result) => result.metadata.type === type);
  }

  /**
   * 创建知识搜索技能，供Hero学习使用
   * 返回一个包含搜索功能的技能对象，Hero可以通过这个技能搜索Codex中的知识
   * @returns Record<string, any> - 包含搜索技能的对象
   * @example
   * const hero = Hero.create();
   * hero.study(codex.lesson());
   * // Hero现在可以使用搜索技能来查询知识库
   */
  lesson(): Record<string, any> {
    const codexInstance = this;

    return {
      search_knowledge: skill({
        description: "在知识库中搜索相关内容",
        inputSchema: z.object({
          query: z.string().describe("搜索查询内容"),
          limit: z
            .number()
            .optional()
            .default(5)
            .describe("返回结果数量限制，默认为5"),
          type: z.string().optional().describe("按类型过滤搜索结果"),
        }),
        execute: async (params: {
          query: string;
          limit?: number;
          type?: string;
        }) => {
          const { query, limit = 5, type } = params;
          try {
            if (type) {
              // 按类型搜索
              const results = await codexInstance.searchByType(
                query,
                type,
                limit
              );
              return {
                success: true,
                results: results.map((r: SearchResult) => ({
                  content: r.content,
                  metadata: r.metadata,
                  distance: r.distance,
                })),
              };
            } else {
              // 普通搜索
              const results = await codexInstance.search(query, { limit });
              return {
                success: true,
                results: results.map((r: SearchResult) => ({
                  content: r.content,
                  metadata: r.metadata,
                  distance: r.distance,
                })),
              };
            }
          } catch (error) {
            return {
              success: false,
              error: `搜索失败: ${
                error instanceof Error ? error.message : String(error)
              }`,
            };
          }
        },
      }),
    };
  }
}
