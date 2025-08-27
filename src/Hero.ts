import {
  LanguageModel,
  generateText,
  generateObject,
  Tool,
  stepCountIs,
  ModelMessage,
} from "ai";
import { Memory } from "./Memory.js";
import { createOpenAI } from "@ai-sdk/openai";
import z from "zod";
import { Session } from "./Session.js";

export class Hero {
  private _model: LanguageModel = createOpenAI().chat("gpt-4o");
  private _system: string = "你是一个智能助手";
  private _tools: Record<string, Tool> = {};
  private _memory: Memory = new Memory();
  private _session: Session = new Session();

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
   * 切换到指定的会话
   */
  session(sessionId: string): Hero {
    const session = this._memory.getSession(sessionId);
    if (!session) {
      throw new Error(`会话 ${sessionId} 不存在`);
    }
    this._session = session;
    return this;
  }

  /**
   * 与英雄对话
   */
  async chat(message: string): Promise<string> {
    try {
      let messages: ModelMessage[] = [];

      // 添加用户消息到当前会话
      const userMessage: ModelMessage = {
        role: "user",
        content: message,
      };
      this._session.messages.push(userMessage);
      this._session.updatedAt = new Date();

      // 调用AI生成回复，传递完整的对话历史以保持上下文记忆
      const result = await generateText({
        model: this._model,
        system: this._system,
        messages: this._session.messages,
        tools: this._tools,
        stopWhen: stepCountIs(5), // 允许最多5步的工具调用
      });

      const assistantMessage: ModelMessage = {
        role: "assistant",
        content: result.text,
      };
      this._session.messages.push(assistantMessage);
      this._session.updatedAt = new Date();
      this._memory.updateSession(this._session);

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

  // Getters for debugging and inspection
  get systemPrompt(): string {
    return this._system;
  }

  /**
   * 获取当前会话ID
   */
  get currentSessionId(): string | undefined {
    return this._session.id;
  }

  get tools(): string[] {
    return Object.keys(this._tools);
  }
}
