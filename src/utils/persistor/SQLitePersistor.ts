import { Database } from "bun:sqlite";
import { Persistor } from "./Persistor.js";
import path from "path";
import { BASE_PATH } from "../../const.js";
import { mkdirSync } from "fs";

export interface SQLitePersistorOptions {
  dir: string;
  name: string;
}

export class SQLitePersistor<
  DATA extends Record<string, any>,
  META extends Record<string, any>
> extends Persistor<DATA, META> {
  private db: Database;
  private name: string;
  private dir: string;

  /**
   * 构造函数，初始化SQLite数据库持久化器
   * @param options 配置选项，包含目录和文件名
   */
  constructor(
    options: SQLitePersistorOptions = {
      dir: BASE_PATH,
      name: "sqlite",
    }
  ) {
    super();

    this.name = options.name;
    this.dir = options.dir;

    // 确保目录存在
    try {
      mkdirSync(this.dir, { recursive: true });
    } catch (error) {
      // 目录已存在时忽略错误
    }

    this.db = new Database(path.join(this.dir, this.name + ".db"), {
      create: true,
    });
    this.db.run(`
      CREATE TABLE IF NOT EXISTS ${this.name} (
        id TEXT PRIMARY KEY,
        meta TEXT NOT NULL,
        data TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);
  }

  /**
   * 保存会话
   * @param session 会话对象
   */
  insert(id: string, meta: META, data: DATA): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO ${this.name} (id, meta, data, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`
    );
    stmt.run(
      id,
      JSON.stringify(meta),
      JSON.stringify(data),
      new Date().toISOString(),
      new Date().toISOString()
    );
  }

  find(id: string): { meta: META; data: DATA } | undefined {
    const stmt = this.db.prepare(`SELECT * FROM ${this.name} WHERE id = ?`);
    const row: any = stmt.get(id);
    if (row) {
      return {
        meta: JSON.parse(row.meta),
        data: JSON.parse(row.data),
      };
    }
    return undefined;
  }

  /**
   * 删除会话
   */
  remove(id: string): void {
    const stmt = this.db.prepare(`DELETE FROM ${this.name} WHERE id = ?`);
    stmt.run(id);
  }

  update(id: string, meta: META, data: DATA): void {
    const stmt = this.db.prepare(
      `UPDATE ${this.name} SET meta = ?, data = ?, updatedAt = ? WHERE id = ?`
    );
    stmt.run(
      JSON.stringify(meta),
      JSON.stringify(data),
      new Date().toISOString(),
      id
    );
  }

  list(): { id: string; meta: META }[] {
    const stmt = this.db.prepare(`SELECT id, meta FROM ${this.name}`);
    const rows: any[] = stmt.all();
    return rows.map((row) => ({
      id: row.id,
      meta: JSON.parse(row.meta),
    }));
  }
}
