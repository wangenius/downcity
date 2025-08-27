import { Session } from "./Session.js";
import { v4 } from "uuid";
import { Persistor } from "./Persistor.js";

export interface MemoryOptions {
  maxSessions?: number;
  persistToFile?: boolean;
  filePath?: string;
}

/**
 * 会话
 * 历史
 * 统计
 */
export class Memory {
  private sessions: Map<string, Session> = new Map();
  private options: MemoryOptions;
  private persistor?: Persistor;

  constructor(options: MemoryOptions = {}) {
    this.options = {
      maxSessions: 100,
      persistToFile: false,
      filePath: "./sessions.json",
      ...options,
    };

    if (this.options.persistToFile && this.options.filePath) {
      this.persistor = new Persistor({ filePath: this.options.filePath });
      this.load().catch(console.error);
    }
  }

  /**
   * 创建新的会话
   */
  newSession(): Session {
    const session: Session = {
      id: v4(),
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(session.id, session);

    // 如果会话数量超过限制，删除最旧的会话
    if (this.sessions.size > (this.options.maxSessions || 100)) {
      this.cleanupOldSessions();
    }

    // 自动保存
    this.save().catch(console.error);

    return session;
  }

  /**
   * 根据ID获取会话
   */
  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  /**
   * 更新会话（当消息变更时调用）
   */
  updateSession(session: Session): boolean {
    if (this.sessions.has(session.id)) {
      session.updatedAt = new Date();
      this.sessions.set(session.id, session);
      // 自动保存
      this.save().catch(console.error);
      return true;
    }
    return false;
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
    const result = this.sessions.delete(id);
    if (result) {
      // 自动保存
      this.save().catch(console.error);
    }
    return result;
  }

  /**
   * 清空所有会话
   */
  clear(): void {
    this.sessions.clear();
    // 自动保存
    this.save().catch(console.error);
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

  /**
   * 手动触发保存（公共方法）
   */
  async save(): Promise<void> {
    if (this.persistor) {
      const data = this.export();
      await this.persistor.save(data);
    }
  }

  /**
   * 手动触发加载（公共方法）
   */
  async load(): Promise<void> {
    if (this.persistor) {
      const data = await this.persistor.load();
      if (data) {
        this.import(data);
      }
    }
  }
}
