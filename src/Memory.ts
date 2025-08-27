import { Session } from "./Session.js";
import { v4 } from "uuid";
import { Persistor } from "./store/Persistor.js";

export class Memory {
  private persistor?: Persistor;
  private sessions: Map<string, Session> = new Map();
  private maxSessions: number = 20;

  constructor(persistor?: Persistor) {
    this.persistor = persistor;
  }

  /**
   * 创建新的会话
   */
  createSession(): Session {
    const session: Session = {
      id: v4(),
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(session.id, session);

    if (this.persistor) {
      this.persistor.save(session);
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
      const session = this.persistor.load(id);
      if (session) {
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
    session.updatedAt = new Date();
    this.sessions.set(session.id, session);

    if (this.persistor) {
      this.persistor.save(session);
    }
    return true;
  }

  /**
   * 获取所有会话
   */
  getAllSessions(): Session[] {
    const sessions = Array.from(this.sessions.values());
    return sessions.sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }

  /**
   * 删除会话
   */
  deleteSession(id: string): boolean {
    this.sessions.delete(id);
    if (this.persistor) {
      this.persistor.delete(id);
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
        this.persistor.delete(id);
      }
      // 如果 persistor 中还有，也一并删除
      const persistedSessions = this.persistor.getAll();
      for (const session of persistedSessions) {
        this.persistor.delete(session.id);
      }
    }
  }

  /**
   * 获取会话统计信息
   */
  getStats(): {
    totalSessions: number;
    totalMessages: number;
    lastActivity: Date | null;
  } {
    const sessions = this.getAllSessions();
    const totalSessions = sessions.length;
    let totalMessages = 0;
    let lastActivity: Date | null = null;

    for (const session of sessions) {
      totalMessages += session.messages.length;
      if (!lastActivity || session.updatedAt > lastActivity) {
        lastActivity = session.updatedAt;
      }
    }

    return {
      totalSessions,
      totalMessages,
      lastActivity,
    };
  }

  /**
   * 清理旧会话
   */
  private cleanupOldSessions(): void {
    const sessions = this.getAllSessions();
    if (sessions.length > this.maxSessions) {
      const sessionsToDelete = sessions.slice(this.maxSessions);
      for (const session of sessionsToDelete) {
        this.deleteSession(session.id);
      }
    }
  }
}
