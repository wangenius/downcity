import { Session } from "./Session.js";

export interface MemoryOptions {
  maxSessions?: number;
  persistToFile?: boolean;
  filePath?: string;
}

export class Memory {
  private sessions: Map<string, Session> = new Map();
  private options: MemoryOptions;

  constructor(options: MemoryOptions = {}) {
    this.options = {
      maxSessions: 100,
      persistToFile: false,
      ...options,
    };
  }

  /**
   * 创建新的会话
   */
  newSession(id?: string): Session {
    const sessionId = id || this.generateSessionId();
    const session: Session = {
      id: sessionId,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(sessionId, session);

    // 如果会话数量超过限制，删除最旧的会话
    if (this.sessions.size > (this.options.maxSessions || 100)) {
      this.cleanupOldSessions();
    }

    return session;
  }

  /**
   * 根据ID获取会话
   */
  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  /**
   * 获取所有会话
   */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }

  /**
   * 删除会话
   */
  deleteSession(id: string): boolean {
    return this.sessions.delete(id);
  }

  /**
   * 清空所有会话
   */
  clear(): void {
    this.sessions.clear();
  }

  /**
   * 获取会话统计信息
   */
  getStats(): {
    totalSessions: number;
    totalMessages: number;
    lastActivity: Date | null;
  } {
    const totalSessions = this.sessions.size;
    let totalMessages = 0;
    let lastActivity: Date | null = null;

    for (const session of this.sessions.values()) {
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
   * 生成唯一的会话ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 清理旧会话
   */
  private cleanupOldSessions(): void {
    const sessions = this.getAllSessions();
    const maxSessions = this.options.maxSessions || 100;

    if (sessions.length > maxSessions) {
      const sessionsToDelete = sessions.slice(maxSessions);
      for (const session of sessionsToDelete) {
        this.sessions.delete(session.id);
      }
    }
  }

  /**
   * 导出会话数据
   */
  export(): any {
    return {
      sessions: Array.from(this.sessions.entries()),
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * 导入会话数据
   */
  import(data: any): void {
    if (data.sessions && Array.isArray(data.sessions)) {
      this.sessions.clear();
      for (const [id, session] of data.sessions) {
        // 确保日期对象正确转换
        if (session.createdAt && typeof session.createdAt === "string") {
          session.createdAt = new Date(session.createdAt);
        }
        if (session.updatedAt && typeof session.updatedAt === "string") {
          session.updatedAt = new Date(session.updatedAt);
        }
        // 转换消息中的时间戳
        if (session.messages) {
          session.messages.forEach((msg: any) => {
            if (msg.timestamp && typeof msg.timestamp === "string") {
              msg.timestamp = new Date(msg.timestamp);
            }
          });
        }
        this.sessions.set(id, session);
      }
    }
  }
}
