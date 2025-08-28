import { Database } from "bun:sqlite";
import { Persistor } from "./Persistor.js";
import { Session } from "../Session.js";
import path from "path";
import { BASE_PATH } from "../const.js";
import { mkdirSync } from "fs";

export interface SQLitePersistorOptions {
  dir: string;
  name: string;
}

export class SQLitePersistor extends Persistor {
  private db: Database;

  /**
   * 构造函数，初始化SQLite数据库持久化器
   * @param options 配置选项，包含目录和文件名
   */
  constructor(
    options: SQLitePersistorOptions = {
      dir: BASE_PATH,
      name: "sqlite.db",
    }
  ) {
    super();
    
    // 确保目录存在
    try {
      mkdirSync(options.dir, { recursive: true });
    } catch (error) {
      // 目录已存在时忽略错误
    }
    
    this.db = new Database(path.join(options.dir, options.name), {
      create: true,
    });
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        messages TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);
  }

  save(session: Session): void {
    const stmt = this.db.prepare(
      "INSERT OR REPLACE INTO sessions (id, messages, createdAt, updatedAt) VALUES (?, ?, ?, ?)"
    );
    stmt.run(
      session.id,
      JSON.stringify(session.messages),
      session.createdAt.toISOString(),
      session.updatedAt.toISOString()
    );
  }

  load(id: string): Session | undefined {
    const stmt = this.db.prepare("SELECT * FROM sessions WHERE id = ?");
    const row: any = stmt.get(id);

    if (row) {
      return {
        id: row.id,
        messages: JSON.parse(row.messages),
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
      };
    }

    return undefined;
  }

  /**
   * 删除会话
   */
  delete(id: string): void {
    const stmt = this.db.prepare("DELETE FROM sessions WHERE id = ?");
    stmt.run(id);
  }

  /**
   * 获取所有会话
   */
  getAll(): Session[] {
    const stmt = this.db.prepare("SELECT * FROM sessions");
    const rows: any[] = stmt.all();

    return rows.map((row) => ({
      id: row.id,
      messages: JSON.parse(row.messages),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));
  }

  getAllSessionsInfo() {
    const stmt = this.db.prepare(
      "SELECT id, createdAt, updatedAt FROM sessions"
    );
    const rows: any[] = stmt.all();

    return rows.map((row) => ({
      id: row.id,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));
  }
}
