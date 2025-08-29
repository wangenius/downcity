import {
  LanguageModel,
  generateText,
  generateObject,
  Tool,
  stepCountIs,
  ModelMessage,
} from "ai";
import { Room } from "../room/Room.js";
import { Shot, ShotMeta } from "../room/Shot.js";
import z from "zod";
import { DEFAULT_MODEL } from "../model/model.js";

export class Hero {
  // 模型
  private _model: LanguageModel = DEFAULT_MODEL;
  // 系统提示词
  private _system: string = "你是一个DownCity中的英雄。";
  // 工具
  private _tools: Record<string, Tool> = {};
  // 持久记忆库
  private _room: Room;
  // 会话
  private _shot: Shot;

  private constructor() {
    this._room = new Room();
    this._shot = this._room.createShot();
  }

  /**
   * 创建一个新的英雄实例
   */
  static create(): Hero {
    return new Hero();
  }

  /**
   * 设置英雄的身份和系统提示词
   */
  avatar(prompt: string): Hero {
    this._system = prompt;
    return this;
  }

  /**
   * 设置语言模型
   */
  model(model: LanguageModel): Hero {
    this._model = model;
    return this;
  }

  /**
   * 学习工具
   */
  study(tools: Record<string, Tool>): Hero {
    this._tools = { ...this._tools, ...tools };
    return this;
  }

  /**
   * 设置记忆系统
   */
  room(room: Room): Hero {
    this._room = room;
    // 重新创建shot，使用新的room
    this._shot = this._room.createShot();
    return this;
  }

  /**
   * 与英雄对话
   */
  async chat(message: string): Promise<string> {
    try {
      // 添加用户消息到当前会话
      const userMessage: ModelMessage = {
        role: "user",
        content: message,
      };
      this._shot.push(userMessage);
      await this.generateTitle(message);

      // 调用AI生成回复，传递完整的对话历史以保持上下文记忆
      const result = await generateText({
        model: this._model,
        system: this._system,
        messages: this._shot.messages,
        tools: this._tools,
        stopWhen: stepCountIs(5), // 允许最多5步的工具调用
      });

      const assistantMessage: ModelMessage = {
        role: "assistant",
        content: result.text,
      };
      this._shot.push(assistantMessage);
      this._room.updateShot(this._shot);

      return result.text;
    } catch (error) {
      console.error("Hero chat error:", error);
      throw error;
    }
  }

  /**
   * 生成JSON对象
   */
  async json<T>(prompt: string, schema: z.Schema<T>): Promise<T> {
    if (!this._model) {
      throw new Error("请先设置语言模型");
    }

    try {
      const { object } = await generateObject({
        model: this._model,
        system: this._system,
        prompt: `${prompt}\n\n请根据以上提示生成符合要求的JSON对象。`,
        schema,
      });

      return object as T;
    } catch (error) {
      console.error("Hero json error:", error);
      throw error;
    }
  }

  /**
   * 基于特定标准进行判断
   */
  async check(content: string, criteria: string): Promise<boolean> {
    if (!this._model) {
      throw new Error("请先设置语言模型");
    }

    try {
      const prompt = `请根据以下标准判断内容是否符合要求：\n\n标准：${criteria}\n\n内容：${content}\n\n请回答：符合 或 不符合`;

      const { text } = await generateText({
        model: this._model,
        system: "你是一个严格的内容审核员，只能回答'符合'或'不符合'。",
        prompt,
      });

      return text.includes("符合") && !text.includes("不符合");
    } catch (error) {
      console.error("Hero check error:", error);
      throw error;
    }
  }

  /**
   * 启动服务器
   */
  async ready(port: number = 3000): Promise<void> {
    // TODO: 实现HTTP服务器
    console.log(`🏰 DownCity Hero is ready on port ${port}`);
    console.log(`🦸 Avatar: ${this._system}`);
    console.log(`🧠 Model: ${this._model ? "Configured" : "Not configured"}`);
    console.log(`🛠️  Tools: ${Object.keys(this._tools).length} tools loaded`);
  }

  /**
   * 新建会话并切换
   */
  renew(): Shot {
    const newShot = this._room.createShot();
    this._shot = newShot;
    return newShot;
  }

  /**
   * 切换会话
   */
  switch(id: string): boolean {
    const shot = this._room.getShot(id);
    if (shot) {
      this._shot = shot;
      return true;
    }
    return false;
  }

  async generateTitle(userMessage: string) {
    if (!this._shot.title) {
      const title = await generateText({
        model: this._model,
        system:
          "你是一个专业的会话标题生成助手。请根据用户的消息内容，生成一个简洁、准确、有意义的会话标题。标题应该：1. 不超过20个字符 2. 准确概括用户的主要意图或问题 3. 使用中文 4. 避免使用标点符号 5. 直接输出标题内容，不需要额外说明",
        messages: [{ role: "user", content: userMessage }],
      });

      if (title.text) {
        this._shot.setTitle(title.text);
      }
    }
  }

  /**
   * 获取所有会话
   */
  shots(): { id: string; meta: ShotMeta }[] {
    return this._room.getShotsList();
  }

  /**
   * 删除会话
   */
  remove(id: string): boolean {
    if (this._shot.id === id) {
      // 如果删除的是当前会话，则切换到一个新的会话
      this.renew();
    }
    return this._room.deleteShot(id);
  }

  /**
   * 清空所有会話
   */
  clear(): void {
    this._room.clear();
    // 清空后，创建一个新的默认会话
    this._shot = this._room.createShot();
  }

  // Getters for debugging and inspection
  get systemPrompt(): string {
    return this._system;
  }

  /**
   * 获取当前会话ID
   */
  get currentShotId(): string | undefined {
    return this._shot.id;
  }

  get tools(): string[] {
    return Object.keys(this._tools);
  }

  /**
   * 获取当前会话
   */
  get shot(): Shot {
    return this._shot;
  }
}
