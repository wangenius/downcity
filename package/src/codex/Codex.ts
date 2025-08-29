import { EmbeddingModel } from "ai";
import { connect, Connection, IndexConfig, Table } from "@lancedb/lancedb";
import { Volume } from "./Volume.js";
import { homedir } from "os";
import { CodexError, ErrorDomain, ErrorCategory, ERROR_IDS } from "./error.js";

/**
 * Codex 配置选项
 */
export interface CodexConfig {
  model: EmbeddingModel;
  path?: string;
}

/**
 * 创建索引参数
 */
export interface CreateIndexParams {
  tableName: string;
  indexName: string;
  dimension: number;
  metric?: "cosine" | "euclidean" | "dotproduct";
  indexConfig?: IndexConfig;
}

/**
 * 索引统计信息
 */
export interface IndexStats {
  dimension: number;
  metric?: "cosine" | "euclidean" | "dotproduct";
  count: number;
}

/**
 * Codex 类，用于管理和检索向量化信息。
 * 内部使用 LanceDB 进行数据存储。
 * codex.volume().
 */
export class Codex {
  private volumes: Record<string, Volume>;
  private db!: Connection;
  private model: EmbeddingModel;

  private constructor(db: Connection, model: EmbeddingModel) {
    this.db = db;
    this.model = model;
    this.volumes = {};
  }

  /**
   * 创建并初始化一个 Codex 实例。
   * @param config - Codex 配置
   * @returns 一个初始化的 Codex 实例
   */
  public static async create(config: CodexConfig): Promise<Codex> {
    try {
      if (!config.model) {
        throw new CodexError({
          id: ERROR_IDS.INVALID_ARGS,
          domain: ErrorDomain.VALIDATION,
          category: ErrorCategory.USER,
          text: "model is required in config",
          details: { config },
        });
      }

      const db = await connect(
        config.path || homedir() + "/.downcity/codex/lancedb"
      );
      const codex = new Codex(db, config.model);
      return codex;
    } catch (error) {
      if (error instanceof CodexError) {
        throw error;
      }
      throw new CodexError(
        {
          id: ERROR_IDS.CODEX_CONNECTION_FAILED,
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: "Failed to connect to LanceDB",
          details: { path: config.path },
        },
        error as Error
      );
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
  private checkConnection(): void {
    if (!this.db) {
      throw new CodexError({
        id: ERROR_IDS.CODEX_NOT_INITIALIZED,
        domain: ErrorDomain.STORAGE,
        category: ErrorCategory.USER,
        text: "Codex not initialized. Use Codex.create() to create an instance",
      });
    }
  }

  /**
   * 列出所有可用的表（volumes）。
   * @returns 表名列表
   */
  async list(): Promise<string[]> {
    try {
      this.checkConnection();
      return await this.db.tableNames();
    } catch (error) {
      if (error instanceof CodexError) {
        throw error;
      }
      throw new CodexError(
        {
          id: ERROR_IDS.TABLE_SCHEMA_FAILED,
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: "Failed to list tables",
        },
        error as Error
      );
    }
  }

  /**
   * 检查表是否存在。
   * @param name - 表名
   * @returns 表是否存在
   */
  async hasTable(name: string): Promise<boolean> {
    try {
      this.checkConnection();
      const tables = await this.db.tableNames();
      return tables.includes(name);
    } catch (error) {
      if (error instanceof CodexError) {
        throw error;
      }
      throw new CodexError(
        {
          id: ERROR_IDS.TABLE_SCHEMA_FAILED,
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: "Failed to check table existence",
          details: { tableName: name },
        },
        error as Error
      );
    }
  }

  /**
   * 删除指定的表。
   * @param name - 表名
   */
  async dropTable(name: string): Promise<void> {
    try {
      this.checkConnection();
      await this.db.dropTable(name);
    } catch (error) {
      throw new CodexError(
        {
          id: ERROR_IDS.TABLE_DELETE_FAILED,
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: "Failed to drop table",
          details: { tableName: name },
        },
        error as Error
      );
    }
  }

  /**
   * 获取或创建一个 Volume 实例。
   * @param name - Volume 名称
   * @returns Volume 实例
   */
  async volume(name: string = "default"): Promise<Volume> {
    try {
      this.checkConnection();
      if (!this.volumes[name]) {
        let table: Table;
        try {
          table = await this.db.openTable(name);
        } catch (error) {
          // 表不存在，创建新表
          // 先获取一个示例向量来确定维度
          const { embed } = await import("ai");
          const { embedding: sampleEmbedding } = await embed({
            model: this.model,
            value: "sample text for dimension detection",
          });

          const sampleData = [
            {
              id: "temp",
              vector: sampleEmbedding, // 使用实际的向量维度
              content: "",
              metadata: {
                type: "temp", // 添加type字段到schema中
              },
            },
          ];
          table = await this.db.createTable(name, sampleData);
          // 删除临时数据
          await table.delete("id = 'temp'");
          console.log(`table ${name} created`);
        }

        this.volumes[name] = new Volume(table, this.model);
      }
      return this.volumes[name];
    } catch (error) {
      if (error instanceof CodexError) {
        throw error;
      }
      throw new CodexError(
        {
          id: ERROR_IDS.VOLUME_CREATE_FAILED,
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: "Failed to create or get volume",
          details: { volumeName: name },
        },
        error as Error
      );
    }
  }

  /**
   * 创建向量索引。
   * @param params - 创建索引参数
   */
  async createIndex(params: CreateIndexParams): Promise<void> {
    try {
      this.checkConnection();
      const table = await this.db.openTable(params.tableName);

      // 使用LanceDB的索引配置格式
      await table.createIndex("vector");
    } catch (error) {
      throw new CodexError(
        {
          id: ERROR_IDS.INDEX_CREATE_FAILED,
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: "Failed to create index",
          details: { params },
        },
        error as Error
      );
    }
  }

  /**
   * 列出表的所有索引。
   * @param tableName - 表名
   * @returns 索引列表
   */
  async listIndexes(tableName: string): Promise<IndexConfig[]> {
    try {
      this.checkConnection();
      const table = await this.db.openTable(tableName);
      return await table.listIndices();
    } catch (error) {
      throw new CodexError(
        {
          id: ERROR_IDS.INDEX_LIST_FAILED,
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: "Failed to list indexes",
          details: { tableName },
        },
        error as Error
      );
    }
  }

  /**
   * 获取索引统计信息。
   * @param tableName - 表名
   * @param indexName - 索引名
   * @returns 索引统计信息
   */
  async getIndexStats(
    tableName: string,
    indexName: string
  ): Promise<IndexStats> {
    try {
      this.checkConnection();
      const table = await this.db.openTable(tableName);
      const stats = await table.indexStats(indexName);
      return {
        dimension: stats?.numIndexedRows || 0,
        metric: "cosine", // LanceDB默认使用cosine
        count: stats?.numIndexedRows || 0,
      };
    } catch (error) {
      throw new CodexError(
        {
          id: ERROR_IDS.INDEX_STATS_FAILED,
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: "Failed to get index stats",
          details: { tableName, indexName },
        },
        error as Error
      );
    }
  }

  /**
   * 删除索引。
   * @param tableName - 表名
   * @param indexName - 索引名
   */
  async dropIndex(tableName: string, indexName: string): Promise<void> {
    try {
      this.checkConnection();
      const table = await this.db.openTable(tableName);
      await table.dropIndex(indexName);
    } catch (error) {
      throw new CodexError(
        {
          id: ERROR_IDS.INDEX_DELETE_FAILED,
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: "Failed to drop index",
          details: { tableName, indexName },
        },
        error as Error
      );
    }
  }
}
