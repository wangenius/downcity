/**
 * 持久化器
 * @template DATA data数据类型
 * @template META 元数据类型, 可以包括title, description 等
 */
export abstract class Persistor<
  DATA extends Record<string, any>,
  META extends Record<string, any>
> {
  /**
   * 插入item
   */
  abstract insert(id: string, meta: META, data: DATA): void;
  /**
   * 查找item
   */
  abstract find(id: string): { meta: META; data: DATA } | undefined;
  /**
   * 删除item
   */
  abstract remove(id: string): void;
  /**
   * 更新item
   */
  abstract update(id: string, meta: META, data: DATA): void;
  /**
   * 列出所有item, 不需要data
   */
  abstract list(): { id: string; meta: META }[];
}
