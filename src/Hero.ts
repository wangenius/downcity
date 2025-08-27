import { LanguageModel, generateText, generateObject, Tool, stepCountIs } from "ai";
import { Memory } from "./Memory.js";
import { createOpenAI } from "@ai-sdk/openai";

export interface Session {
  id: string;
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export class Hero {
  private _model: LanguageModel = createOpenAI().chat("gpt-4o");
  private _system: string = "你是一个智能助手";
  private _tools: Record<string, Tool> = {};
  private _memory?: Memory;
  private _currentSession?: Session;

  private constructor() {}

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
  memory(memory: Memory): Hero {
    this._memory = memory;
    return this;
  }

  /**
   * 设置当前会话
   */
  session(session: Session): Hero {
    this._currentSession = session;
    return this;
  }

  /**
   * 与英雄对话
   */
  async chat(message: string): Promise<string> {
    if (!this._model) {
      throw new Error("请先设置语言模型");
    }

    try {
      // 添加消息到当前会话
      if (this._currentSession) {
        this._currentSession.messages.push({
          role: "user",
          content: message,
          timestamp: new Date(),
        });
        this._currentSession.updatedAt = new Date();
      }

      // 调用AI生成回复，启用多步调用来自动处理工具调用
      const result = await generateText({
        model: this._model,
        system: this._system,
        prompt: message,
        tools: this._tools,
        stopWhen: stepCountIs(5), // 允许最多5步的工具调用
      });

      // 添加回复到当前会话
      if (this._currentSession) {
        this._currentSession.messages.push({
          role: "assistant",
          content: result.text,
          timestamp: new Date(),
        });
        this._currentSession.updatedAt = new Date();
      }

      return result.text;
    } catch (error) {
      console.error("Hero chat error:", error);
      throw error;
    }
  }

  /**
   * 生成JSON对象
   */
  async json<T>(prompt: string, schema: any): Promise<T> {
    if (!this._model) {
      throw new Error("请先设置语言模型");
    }

    try {
      const { object } = await generateObject({
        model: this._model,
        system: this._system,
        prompt,
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
    console.log(`🛠️  Tools: ${this._tools.length} tools loaded`);
  }

  // Getters for debugging and inspection
  get systemPrompt(): string {
    return this._system;
  }

  get tools(): string[] {
    return Object.keys(this._tools);
  }

  get currentSession(): Session | undefined {
    return this._currentSession;
  }
}
