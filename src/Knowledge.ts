import { embed, tool, Tool } from "ai";
import z from "zod";
import * as fs from "fs/promises";
import { ChromaClient, Collection, OpenAIEmbeddingFunction } from "chromadb";

export interface VectorModelConfig {
  model: any; // ai-sdk模型实例
  dimensions?: number;
}

export interface ChromaConfig {
  url?: string;
  collection?: string;
  persistPath?: string;
}

export interface KnowledgeOptions {
  autoLoad?: boolean;
  categories?: string[];
  vectorDimension?: number;
  similarityThreshold?: number;
  vectorModel?: VectorModelConfig;
  chroma?: ChromaConfig;
  localFile?: string;
}

export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  vector?: number[]; // 向量表示
  createdAt: Date;
  updatedAt: Date;
}

export class Knowledge {
  private knowledgeBase: Map<string, KnowledgeItem> = new Map();
  private categories: Set<string> = new Set();
  private options: KnowledgeOptions;
  private chromaClient?: ChromaClient;
  private collection?: Collection;
  private embeddingModel?: any; // ai-sdk模型实例
  private embeddingFunction?: OpenAIEmbeddingFunction;

  constructor(options: KnowledgeOptions = {}) {
    this.options = {
      autoLoad: true,
      categories: ["general", "programming", "api", "documentation"],
      vectorDimension: 1536, // OpenAI embedding dimension
      similarityThreshold: 0.7,
      chroma: {
        collection: "downcity_knowledge",
        persistPath: "./chroma_db",
      },
      localFile: "./knowledge.json",
      ...options,
    };

    // 初始化默认分类
    if (this.options.categories) {
      this.options.categories.forEach((cat) => this.categories.add(cat));
    }

    // 初始化向量数据库和加载本地数据
    this.initializeVectorDB();
    if (this.options.autoLoad) {
      this.loadFromFile();
    }
  }

  /**
   * 创建Knowledge实例
   */
  static create(options?: KnowledgeOptions): Knowledge {
    return new Knowledge(options);
  }

  /**
   * 初始化向量数据库
   */
  private async initializeVectorDB(): Promise<void> {
    try {
      // 动态导入chromadb
      const { ChromaClient } = await import("chromadb");

      if (this.options.chroma?.persistPath) {
        this.chromaClient = new ChromaClient({
          path: this.options.chroma.persistPath,
        });
      } else {
        this.chromaClient = new ChromaClient();
      }

      // 获取或创建集合
      const collectionName =
        this.options.chroma?.collection || "downcity_knowledge";
      try {
        const getParams: any = { name: collectionName };
        if (this.embeddingFunction) {
          getParams.embeddingFunction = this.embeddingFunction;
        }
        this.collection = await this.chromaClient.getCollection(getParams);
      } catch {
        // 集合不存在，创建新集合
        const createParams: any = {
          name: collectionName,
          metadata: { description: "DownCity Knowledge Base" },
        };
        if (this.embeddingFunction) {
          createParams.embeddingFunction = this.embeddingFunction;
        }
        this.collection = await this.chromaClient.createCollection(
          createParams
        );
      }

      // 初始化embedding模型
      if (this.options.vectorModel?.model) {
        this.embeddingModel = this.options.vectorModel.model;
      }
    } catch (error) {
      console.warn("Failed to initialize vector database:", error);
    }
  }

  /**
   * 配置向量模型
   */
  model(config: VectorModelConfig): Knowledge {
    this.options.vectorModel = { ...this.options.vectorModel, ...config };

    // 设置embedding模型
    if (config.model) {
      this.embeddingModel = config.model;
    }

    return this;
  }

  /**
   * 保存数据到本地文件
   */
  private async saveToFile(): Promise<void> {
    if (!this.options.localFile) return;

    try {
      const data = this.export();
      await fs.writeFile(this.options.localFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn("Failed to save to local file:", error);
    }
  }

  /**
   * 从本地文件加载数据
   */
  private async loadFromFile(): Promise<void> {
    if (!this.options.localFile) return;

    try {
      const data = await fs.readFile(this.options.localFile, "utf-8");
      this.import(JSON.parse(data));
    } catch (error) {
      // 文件不存在时忽略
    }
  }

  /**
   * 获取知识库操作工具
   * 将知识库的操作方法包装成工具供Hero调用
   */
  tools(): Record<string, Tool> {
    return {
      search_knowledge: tool({
        description: "在知识库中搜索相关信息",
        inputSchema: z.object({
          query: z.string().describe("The search query"),
          category: z.string().optional().describe("The category to filter"),
        }),
        execute: async (params) => {
          const results = await this.searchKnowledge(
            params.query,
            params.category
          );
          return {
            results: results.slice(0, 5), // 限制返回前5个结果
            total: results.length,
          };
        },
      }),
      getKnowledgeCategories: tool({
        description: "获取知识库中所有可用的分类",
        inputSchema: z.object({}),
        execute: async () => {
          return {
            categories: this.getCategories(),
          };
        },
      }),
      get_knowledge_stats: tool({
        description: "获取知识库统计信息",
        inputSchema: z.object({}),
        execute: async () => {
          return this.getStats();
        },
      }),
    };
  }

  /**
   * 添加知识条目
   */
  async addKnowledge(
    item: Omit<KnowledgeItem, "id" | "createdAt" | "updatedAt">
  ): Promise<KnowledgeItem> {
    const id = this.generateId();
    const now = new Date();
    const knowledgeItem: KnowledgeItem = {
      id,
      ...item,
      createdAt: now,
      updatedAt: now,
    };

    // 生成向量
    if (!knowledgeItem.vector) {
      knowledgeItem.vector = await this.generateEmbedding(
        `${item.title} ${item.content}`
      );
    }

    // 存储到本地缓存
    this.knowledgeBase.set(id, knowledgeItem);
    this.categories.add(item.category);

    // 存储到Chroma数据库
    if (this.collection) {
      try {
        await this.collection.add({
          ids: [id],
          embeddings: [knowledgeItem.vector],
          metadatas: [
            {
              title: item.title,
              category: item.category,
              tags: item.tags.join(","),
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
            },
          ],
          documents: [item.content],
        });
      } catch (error) {
        console.warn("Failed to add to Chroma database:", error);
      }
    }

    // 保存到本地文件
    await this.saveToFile();

    return knowledgeItem;
  }

  /**
   * 更新知识条目
   */
  updateKnowledge(
    id: string,
    updates: Partial<Omit<KnowledgeItem, "id" | "createdAt">>
  ): KnowledgeItem | undefined {
    const existing = this.knowledgeBase.get(id);
    if (!existing) return undefined;

    const updated: KnowledgeItem = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };

    this.knowledgeBase.set(id, updated);
    if (updates.category) {
      this.categories.add(updates.category);
    }
    return updated;
  }

  /**
   * 获取知识条目
   */
  getKnowledge(id: string): KnowledgeItem | undefined {
    return this.knowledgeBase.get(id);
  }

  /**
   * 搜索知识库（支持向量搜索和文本匹配）
   */
  async searchKnowledge(
    query: string,
    category?: string,
    useVector: boolean = true
  ): Promise<KnowledgeItem[]> {
    // 优先使用向量搜索
    if (useVector && this.collection) {
      try {
        const queryVector = await this.generateEmbedding(query);
        const chromaResults = await this.collection.query({
          queryEmbeddings: [queryVector],
          nResults: 10,
          where: category ? { category } : undefined,
        });

        // 将Chroma结果转换为KnowledgeItem
        const results: KnowledgeItem[] = [];
        if (chromaResults.ids && chromaResults.ids[0]) {
          for (let i = 0; i < chromaResults.ids[0].length; i++) {
            const id = chromaResults.ids[0][i];
            const item = this.knowledgeBase.get(id);
            if (item) {
              results.push(item);
            }
          }
        }

        if (results.length > 0) {
          return results;
        }
      } catch (error) {
        console.warn(
          "Vector search failed, falling back to text search:",
          error
        );
      }
    }

    // 降级到文本搜索
    return this.textSearchKnowledge(query, category);
  }

  /**
   * 文本搜索知识库
   */
  private textSearchKnowledge(
    query: string,
    category?: string
  ): KnowledgeItem[] {
    const results: KnowledgeItem[] = [];
    const lowerQuery = query.toLowerCase();

    for (const item of this.knowledgeBase.values()) {
      // 分类过滤
      if (category && item.category !== category) continue;

      // 文本匹配
      const matchesTitle = item.title.toLowerCase().includes(lowerQuery);
      const matchesContent = item.content.toLowerCase().includes(lowerQuery);
      const matchesTags = item.tags.some((tag) =>
        tag.toLowerCase().includes(lowerQuery)
      );

      if (matchesTitle || matchesContent || matchesTags) {
        results.push(item);
      }
    }

    // 按更新时间排序
    return results.sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }

  /**
   * 向量相似度搜索
   */
  searchByVector(
    queryVector: number[],
    category?: string,
    limit: number = 10
  ): Array<KnowledgeItem & { similarity: number }> {
    const results: Array<KnowledgeItem & { similarity: number }> = [];

    for (const item of this.knowledgeBase.values()) {
      // 分类过滤
      if (category && item.category !== category) continue;

      // 跳过没有向量的条目
      if (!item.vector) continue;

      // 计算余弦相似度
      const similarity = this.cosineSimilarity(queryVector, item.vector);

      // 只保留超过阈值的结果
      if (similarity >= (this.options.similarityThreshold || 0.7)) {
        results.push({ ...item, similarity });
      }
    }

    // 按相似度排序并限制结果数量
    return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error("向量维度不匹配");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * 为知识条目生成向量
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (this.embeddingModel) {
      const { embedding } = await embed({
        model: this.embeddingModel,
        value: text,
      });
      return embedding;
    }
    throw new Error("Embedding model not set");
  }

  /**
   * 添加知识条目并生成向量
   */
  async addKnowledgeWithVector(
    item: Omit<KnowledgeItem, "id" | "createdAt" | "updatedAt" | "vector">
  ): Promise<KnowledgeItem> {
    const vector = await this.generateEmbedding(
      `${item.title} ${item.content}`
    );
    return this.addKnowledge({ ...item, vector });
  }

  /**
   * 根据分类获取知识
   */
  getKnowledgeByCategory(category: string): KnowledgeItem[] {
    return Array.from(this.knowledgeBase.values())
      .filter((item) => item.category === category)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  /**
   * 获取所有分类
   */
  getCategories(): string[] {
    return Array.from(this.categories);
  }

  /**
   * 删除知识条目
   */
  removeKnowledge(id: string): boolean {
    return this.knowledgeBase.delete(id);
  }

  /**
   * 清空知识库
   */
  clearKnowledge(): void {
    this.knowledgeBase.clear();
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalKnowledge: number;
    totalCategories: number;
    knowledgeByCategory: Record<string, number>;
  } {
    const knowledgeByCategory: Record<string, number> = {};

    for (const item of this.knowledgeBase.values()) {
      knowledgeByCategory[item.category] =
        (knowledgeByCategory[item.category] || 0) + 1;
    }

    return {
      totalKnowledge: this.knowledgeBase.size,
      totalCategories: this.categories.size,
      knowledgeByCategory,
    };
  }

  /**
   * 导出数据
   */
  export(): any {
    return {
      knowledgeBase: Array.from(this.knowledgeBase.entries()),
      categories: Array.from(this.categories),
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * 导入数据
   */
  import(data: any): void {
    if (data.knowledgeBase && Array.isArray(data.knowledgeBase)) {
      this.knowledgeBase.clear();
      for (const [id, item] of data.knowledgeBase) {
        // 确保日期对象正确转换
        if (item.createdAt && typeof item.createdAt === "string") {
          item.createdAt = new Date(item.createdAt);
        }
        if (item.updatedAt && typeof item.updatedAt === "string") {
          item.updatedAt = new Date(item.updatedAt);
        }
        this.knowledgeBase.set(id, item);
      }
    }

    if (data.categories && Array.isArray(data.categories)) {
      this.categories.clear();
      data.categories.forEach((cat: string) => this.categories.add(cat));
    }
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `knowledge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
