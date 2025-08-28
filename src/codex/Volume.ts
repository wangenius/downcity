import { embed, EmbeddingModel } from "ai";
import { Collection, Where } from "chromadb";

export class Volume {
  private collection: Collection;
  private model: EmbeddingModel;

  constructor(collection: Collection, model: EmbeddingModel) {
    this.collection = collection;
    this.model = model;
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
    const { embedding } = await embed({
      model: this.model,
      value: content,
    });

    const id = crypto.randomUUID();
    await this.collection.add({
      ids: [id],
      embeddings: [embedding],
      metadatas: [{ ...metadata, content }], // 将原始文本也存入元数据以便直接返回
      documents: [content], // document 用于 ChromaDB 的全文搜索
    });

    return id;
  }

  /**
   * 根据查询文本进行向量搜索。
   * @param query - 查询文本。
   * @param k - 返回的最相似结果数量。
   * @param where - 用于过滤元数据的条件。例如: { type: 'knowledge' }
   * @returns 搜索结果列表。
   */
  async search(
    query: string,
    k: number = 5,
    where: Where = {}
  ): Promise<any[]> {
    const { embedding } = await embed({
      model: this.model,
      value: query,
    });

    const results = await this.collection.query({
      queryEmbeddings: [embedding],
      nResults: k,
      where,
    });

    // 格式化返回结果
    const searchResults: any[] = [];
    if (results.ids && results.ids.length > 0) {
      for (let i = 0; i < results.ids[0].length; i++) {
        searchResults.push({
          id: results.ids[0][i],
          content: results.documents?.[0]?.[i] ?? "",
          metadata: results.metadatas?.[0]?.[i] ?? {},
          distance: results.distances?.[0]?.[i], // ChromaDB 返回的是距离
        });
      }
    }
    return searchResults;
  }
}
