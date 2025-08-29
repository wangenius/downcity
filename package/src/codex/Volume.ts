import { embed, EmbeddingModel } from "ai";
import { Table } from "@lancedb/lancedb";
import { CodexError, ErrorDomain, ErrorCategory, ERROR_IDS } from "./error.js";

/**
 * 批量嵌入参数
 */
export interface BatchEmbeddingItem {
  content: string;
  metadata?: Record<string, any>;
  id?: string;
}

/**
 * 搜索选项
 */
export interface SearchOptions {
  /** 返回的最相似结果数量 */
  limit?: number;
  /** 用于过滤元数据的条件 */
  where?: Record<string, any>;
  /** 要返回的列，如果不指定则返回所有列 */
  select?: string[];
  /** 是否包含向量数据 */
  includeVector?: boolean;
  /** 距离阈值，只返回距离小于此值的结果 */
  distanceThreshold?: number;
}

/**
 * 搜索结果
 */
export interface SearchResult {
  id: string;
  content: string;
  metadata: Record<string, any>;
  distance: number;
  vector?: number[];
}

export class Volume {
  private table: Table;
  private model: EmbeddingModel;

  constructor(table: Table, model: EmbeddingModel) {
    this.table = table;
    this.model = model;
  }

  /**
   * 扁平化嵌套的metadata对象，将嵌套属性转换为点分隔的键名。
   * @param metadata - 原始metadata对象
   * @param prefix - 键名前缀
   * @returns 扁平化后的对象
   */
  private flattenMetadata(metadata: Record<string, any>, prefix: string = ''): Record<string, any> {
    const flattened: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(metadata)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        // 递归处理嵌套对象
        Object.assign(flattened, this.flattenMetadata(value, newKey));
      } else {
        // 直接赋值基本类型和数组
        flattened[newKey] = value;
      }
    }
    
    return flattened;
  }

  /**
   * 反扁平化metadata对象，将点分隔的键名转换回嵌套结构。
   * @param flattened - 扁平化的对象
   * @returns 嵌套结构的对象
   */
  private unflattenMetadata(flattened: Record<string, any>): Record<string, any> {
    const nested: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(flattened)) {
      const keys = key.split('.');
      let current = nested;
      
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!(k in current)) {
          current[k] = {};
        }
        current = current[k];
      }
      
      current[keys[keys.length - 1]] = value;
    }
    
    return nested;
  }
  /**
   * 将文本内容转换为向量并存入数据库。
   * @param content - 要存储的文本内容。
   * @param metadata - 附加的元数据，可用于后续过滤。例如: { type: 'knowledge' } 或 { type: 'dynamic', category: 'preference' }
   * @returns 生成的唯一 ID。
   */
  async embedding(
    content: string,
    metadata: Record<string, any> = {}
  ): Promise<string> {
    try {
      if (!content || typeof content !== 'string') {
        throw new CodexError({
          id: ERROR_IDS.INVALID_ARGS,
          domain: ErrorDomain.VALIDATION,
          category: ErrorCategory.USER,
          text: 'Content must be a non-empty string',
          details: { content },
        });
      }

      const { embedding } = await embed({
        model: this.model,
        value: content,
      });

      const id = crypto.randomUUID();
      // 扁平化metadata以支持嵌套对象
      const flattenedMetadata = this.flattenMetadata(metadata);
      
      const data = {
        id,
        vector: embedding,
        content,
        metadata: flattenedMetadata,
      };

      await this.table.add([data]);
      return id;
    } catch (error) {
      if (error instanceof CodexError) {
        throw error;
      }
      throw new CodexError(
        {
          id: ERROR_IDS.VOLUME_EMBEDDING_FAILED,
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: 'Failed to create embedding',
          details: { content: content.substring(0, 100) },
        },
        error as Error
      );
    }
   }

  /**
   * 批量将文本内容转换为向量并存入数据库。
   * @param items - 要批量处理的项目列表
   * @returns 生成的ID列表
   */
  async batchEmbedding(items: BatchEmbeddingItem[]): Promise<string[]> {
    try {
      if (!Array.isArray(items) || items.length === 0) {
        throw new CodexError({
          id: ERROR_IDS.INVALID_ARGS,
          domain: ErrorDomain.VALIDATION,
          category: ErrorCategory.USER,
          text: 'Items must be a non-empty array',
          details: { itemsLength: items?.length },
        });
      }

      const batchData = [];
      const ids = [];

      for (const item of items) {
        if (!item.content || typeof item.content !== 'string') {
          throw new CodexError({
            id: ERROR_IDS.INVALID_ARGS,
            domain: ErrorDomain.VALIDATION,
            category: ErrorCategory.USER,
            text: 'Each item must have a non-empty content string',
            details: { item },
          });
        }

        const { embedding } = await embed({
          model: this.model,
          value: item.content,
        });

        const id = item.id || crypto.randomUUID();
        const flattenedMetadata = this.flattenMetadata(item.metadata || {});
        
        batchData.push({
          id,
          vector: embedding,
          content: item.content,
          metadata: flattenedMetadata,
        });
        
        ids.push(id);
      }

      await this.table.add(batchData);
      return ids;
    } catch (error) {
      if (error instanceof CodexError) {
        throw error;
      }
      throw new CodexError(
        {
          id: ERROR_IDS.VOLUME_BATCH_FAILED,
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: 'Failed to batch embed items',
          details: { itemCount: items?.length },
        },
        error as Error
      );
    }
  }

  /**
   * 根据查询文本进行向量搜索。
   * @param query - 查询文本。
   * @param options - 搜索选项
   * @returns 搜索结果列表。
   */
  async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    try {
      if (!query || typeof query !== 'string') {
        throw new CodexError({
          id: ERROR_IDS.INVALID_ARGS,
          domain: ErrorDomain.VALIDATION,
          category: ErrorCategory.USER,
          text: 'Query must be a non-empty string',
          details: { query },
        });
      }

      const {
        limit = 5,
        where = {},
        select,
        includeVector = false,
        distanceThreshold,
      } = options;

      const { embedding } = await embed({
        model: this.model,
        value: query,
      });

      let searchQuery = this.table.search(embedding).limit(limit);

      // 添加列选择
      if (select && select.length > 0) {
        const columns = includeVector ? [...select, 'vector'] : select;
        searchQuery = searchQuery.select(columns);
      } else if (!includeVector) {
        // 默认不包含向量列以节省带宽
        searchQuery = searchQuery.select(['id', 'content', 'metadata', '_distance']);
      }

      // 如果有过滤条件，添加 where 子句
      if (Object.keys(where).length > 0) {
        const whereConditions = this.buildWhereConditions(where);
        searchQuery = searchQuery.where(whereConditions);
      }

      const results = await searchQuery.toArray();

      // 过滤距离阈值
      let filteredResults = results;
      if (distanceThreshold !== undefined) {
        filteredResults = results.filter((result: any) => result._distance <= distanceThreshold);
      }

      // 格式化返回结果
      return filteredResults.map((result: any) => {
        const searchResult: SearchResult = {
          id: result.id,
          content: result.content,
          metadata: this.unflattenMetadata(result.metadata || {}),
          distance: result._distance,
        };

        if (includeVector && result.vector) {
          searchResult.vector = result.vector;
        }

        return searchResult;
      });
    } catch (error) {
      if (error instanceof CodexError) {
        throw error;
      }
      throw new CodexError(
        {
          id: ERROR_IDS.VOLUME_SEARCH_FAILED,
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: 'Failed to perform vector search',
          details: { query: query.substring(0, 100), options },
        },
        error as Error
      );
    }
  }

  /**
   * 构建where条件字符串，支持复杂的过滤条件。
   * @param where - 过滤条件对象
   * @returns where条件字符串
   */
  private buildWhereConditions(where: Record<string, any>): string {
    const conditions: string[] = [];
    
    for (const [key, value] of Object.entries(where)) {
      if (value === null) {
        conditions.push(`metadata.${key} IS NULL`);
      } else if (Array.isArray(value)) {
        // 支持 IN 操作
        const values = value.map(v => `'${v}'`).join(', ');
        conditions.push(`metadata.${key} IN (${values})`);
      } else if (typeof value === 'object' && value !== null) {
        // 支持操作符对象，如 { $gt: 10, $lt: 20 }
        for (const [op, opValue] of Object.entries(value)) {
          switch (op) {
            case '$gt':
              conditions.push(`metadata.${key} > ${opValue}`);
              break;
            case '$gte':
              conditions.push(`metadata.${key} >= ${opValue}`);
              break;
            case '$lt':
              conditions.push(`metadata.${key} < ${opValue}`);
              break;
            case '$lte':
              conditions.push(`metadata.${key} <= ${opValue}`);
              break;
            case '$ne':
              conditions.push(`metadata.${key} != '${opValue}'`);
              break;
            default:
              conditions.push(`metadata.${key} = '${opValue}'`);
          }
        }
      } else {
        conditions.push(`metadata.${key} = '${value}'`);
      }
    }
    
    return conditions.join(' AND ');
  }
}
