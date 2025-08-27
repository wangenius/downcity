import { Database } from "bun:sqlite";
import { Persistor } from "./Persistor.js";
import { Session } from "../Session.js";

export interface SQLitePersistorOptions {
  filePath: string;
}

export class SQLitePersistor extends Persistor {
  private db: Database;

  constructor(options: SQLitePersistorOptions) {
    super();
    this.db = new Database(options.filePath, { create: true });
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