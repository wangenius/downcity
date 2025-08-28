import { Session, SessionData, SessionMeta } from "./Session.js";
import { Persistor } from "../utils/persistor/Persistor.js";
import {
  SQLitePersistor,
  SQLitePersistorOptions,
} from "../utils/persistor/SQLitePersistor.js";
import { BASE_PATH } from "../const.js";
import { log } from "console";

export type VaultPersistor = Persistor<SessionData, SessionMeta>;

/**
 * 历史记录管理器
 * 1. 会话管理
 * 2. 会话存储
 * 3. 会话持久化
 * 4. 近期会话历史记录
 */
export class Vault {
  // 持久化存储器
  private persistor?: VaultPersistor;
  // 会话存储
  private sessions: Map<string, Session> = new Map();
  // 最大的会话数
  private maxSessions: number = 20;
  /**
   * 构造函数，初始化历史记录管理器
   * @param persistor 可选的持久化存储器
   */
  constructor(persistor?: VaultPersistor) {
    this.persistor = persistor;
  }

  /**
   * 创建新的会话:
   */
  createSession(): Session {
    const session = Session.create();
    this.sessions.set(session.id, session);

    if (this.persistor) {
      this.persistor.insert(session.id, session.meta, session.data);
    }

    // 如果会话数量超过限制，删除最旧的会话
    if (this.sessions.size > this.maxSessions) {
      this.cleanupOldSessions();
    }

    return session;
  }

  /**
   * 根据ID获取会话
   */
  getSession(id: string): Session | undefined {
    if (this.sessions.has(id)) {
      return this.sessions.get(id);
    }

    if (this.persistor) {
      const item = this.persistor.find(id);
      if (item) {
        const session = new Session(id, item.meta, item.data);
        this.sessions.set(id, session);
        return session;
      }
    }

    return undefined;
  }

  /**
   * 更新会话（当消息变更时调用）
   */
  updateSession(session: Session): boolean {
    this.sessions.set(session.id, session);
    if (this.persistor) {
      this.persistor.update(session.id, session.meta, session.data);
    }
    return true;
  }

  /**
   * 获取所有会话信息
   */
  getSessionsList(): { id: string; meta: SessionMeta }[] {
    if (this.persistor) {
      return this.persistor.list();
    }
    return [];
  }

  /**
   * 删除会话
   */
  deleteSession(id: string): boolean {
    this.sessions.delete(id);
    if (this.persistor) {
      this.persistor.remove(id);
    }
    return true;
  }

  /**
   * 清空所有会话
   */
  clear(): void {
    const sessionIds = Array.from(this.sessions.keys());
    this.sessions.clear();
    if (this.persistor) {
      // 在内存中先获取所有session id
      for (const id of sessionIds) {
        this.persistor.remove(id);
      }
      // 如果 persistor 中还有，也一并删除
      const persistedSessions = this.persistor.list();
      for (const session of persistedSessions) {
        this.persistor.remove(session.id);
      }
    }
  }

  /**
   * 清理旧会话
   */
  private cleanupOldSessions(): void {
    const sessions = this.getSessionsList();
    if (sessions.length > this.maxSessions) {
      const sessionsToDelete = sessions.slice(this.maxSessions);
      for (const session of sessionsToDelete) {
        this.deleteSession(session.id);
      }
    }
  }
}

/**
 * SQLite session持久化器
 */
export class SQLiteVaultPersistor extends SQLitePersistor<
  SessionData,
  SessionMeta
> {
  constructor(
    options: SQLitePersistorOptions = {
      dir: BASE_PATH,
      name: "sqlite",
    }
  ) {
    super(options);
  }
}
