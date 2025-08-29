import { Shot, ShotData, ShotMeta } from "./Shot.js";
import { Persistor } from "../utils/persistor/Persistor.js";
import {
  SQLitePersistor,
  SQLitePersistorOptions,
} from "../utils/persistor/SQLitePersistor.js";
import { BASE_PATH } from "../cli/const.js";

export type RoomPersistor = Persistor<ShotData, ShotMeta>;

/**
 * 历史记录管理器
 * 1. 会话管理
 * 2. 会话存储
 * 3. 会话持久化
 * 4. 近期会话历史记录
 */
export class Room {
  // 持久化存储器
  private persistor?: RoomPersistor;
  // 会话存储
  private shots: Map<string, Shot> = new Map();
  // 最大的会话数
  private maxShots: number = 20;
  /**
   * 构造函数，初始化历史记录管理器
   * @param persistor 可选的持久化存储器
   */
  constructor(persistor?: RoomPersistor) {
    this.persistor = persistor;
  }

  /**
   * 创建新的会话:
   */
  createShot(): Shot {
    const shot = Shot.create();
    this.shots.set(shot.id, shot);

    if (this.persistor) {
      this.persistor.insert(shot.id, shot.meta, shot.data);
    }

    // 如果会话数量超过限制，删除最旧的会话
    if (this.shots.size > this.maxShots) {
      this.cleanupOldShots();
    }

    return shot;
  }

  /**
   * 根据ID获取会话
   */
  getShot(id: string): Shot | undefined {
    if (this.shots.has(id)) {
      return this.shots.get(id);
    }

    if (this.persistor) {
      const item = this.persistor.find(id);
      if (item) {
        const shot = new Shot(id, item.meta, item.data);
        this.shots.set(id, shot);
        return shot;
      }
    }

    return undefined;
  }

  /**
   * 更新会话（当消息变更时调用）
   */
  updateShot(shot: Shot): boolean {
    this.shots.set(shot.id, shot);
    if (this.persistor) {
      this.persistor.update(shot.id, shot.meta, shot.data);
    }
    return true;
  }

  /**
   * 获取所有会话信息
   */
  getShotsList(): { id: string; meta: ShotMeta }[] {
    if (this.persistor) {
      return this.persistor.list();
    }
    return [];
  }

  /**
   * 删除会话
   */
  deleteShot(id: string): boolean {
    this.shots.delete(id);
    if (this.persistor) {
      this.persistor.remove(id);
    }
    return true;
  }

  /**
   * 清空所有会话
   */
  clear(): void {
    const shotIds = Array.from(this.shots.keys());
    this.shots.clear();
    if (this.persistor) {
      // 在内存中先获取所有shot id
      for (const id of shotIds) {
        this.persistor.remove(id);
      }
      // 如果 persistor 中还有，也一并删除
      const persistedShots = this.persistor.list();
      for (const shot of persistedShots) {
        this.persistor.remove(shot.id);
      }
    }
  }

  /**
   * 清理旧会话
   */
  private cleanupOldShots(): void {
    const shots = this.getShotsList();
    if (shots.length > this.maxShots) {
      const shotsToDelete = shots.slice(this.maxShots);
      for (const shot of shotsToDelete) {
        this.deleteShot(shot.id);
      }
    }
  }
}

/**
 * SQLite shot持久化器
 */
export class SQLiteRoomPersistor extends SQLitePersistor<ShotData, ShotMeta> {
  constructor(
    options: SQLitePersistorOptions = {
      dir: BASE_PATH,
      name: "sqlite",
    }
  ) {
    super(options);
  }
}
