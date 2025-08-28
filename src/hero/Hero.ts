import {
  LanguageModel,
  generateText,
  generateObject,
  Tool,
  stepCountIs,
  ModelMessage,
} from "ai";
import { Vault } from "../vault/Vault.js";
import { createOpenAI } from "@ai-sdk/openai";
import z from "zod";
import { Session, SessionMeta } from "../vault/Session.js";

export class Hero {
  // 模型
  private _model: LanguageModel = createOpenAI().chat("gpt-4o");
  // 系统提示词
  private _system: string = "你是一个智能助手";
  // 工具
  private _tools: Record<string, Tool> = {};
  // 持久记忆库
  private _vault: Vault;
  // 会话
  private _session: Session;

  private constructor() {
    this._vault = new Vault();
    this._session = this._vault.createSession();
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
  vault(vault: Vault): Hero {
    this._vault = vault;
    // 重新创建session，使用新的vault
    this._session = this._vault.createSession();
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
      this._session.push(userMessage);

      if (!this._session.title) {
        const title = await generateText({
          model: this._model,
          system: "你是一个专业的会话标题生成助手。请根据用户的消息内容，生成一个简洁、准确、有意义的会话标题。标题应该：1. 不超过20个字符 2. 准确概括用户的主要意图或问题 3. 使用中文 4. 避免使用标点符号 5. 直接输出标题内容，不需要额外说明",
          messages: [userMessage],
        });

        if (title.text) {
          this._session.setTitle(title.text);
        }
      }

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
      this._session.push(assistantMessage);
      this._vault.updateSession(this._session);

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
  renew(): Session {
    const newSession = this._vault.createSession();
    this._session = newSession;
    return newSession;
  }

  /**
   * 切换会话
   */
  switch(id: string): boolean {
    const session = this._vault.getSession(id);
    if (session) {
      this._session = session;
      return true;
    }
    return false;
  }

  /**
   * 获取所有会话
   */
  sessions(): { id: string; meta: SessionMeta }[] {
    return this._vault.getSessionsList();
  }

  /**
   * 删除会话
   */
  remove(id: string): boolean {
    if (this._session.id === id) {
      // 如果删除的是当前会话，则切换到一个新的会话
      this.renew();
    }
    return this._vault.deleteSession(id);
  }

  /**
   * 清空所有会話
   */
  clear(): void {
    this._vault.clear();
    // 清空后，创建一个新的默认会话
    this._session = this._vault.createSession();
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

  /**
   * 获取当前会话
   */
  get session(): Session {
    return this._session;
  }
}
