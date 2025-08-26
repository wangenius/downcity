import { generateText, generateObject, LanguageModel } from "ai";
import z, { ZodType } from "zod";

export class Agent {
  private model: LanguageModel;

  constructor(model: LanguageModel) {
    this.model = model;
  }

  async text(
    query: string,
    system: string = "你是一个专业的营销分析师，擅长分析各种营销案例并提供深入的洞察和建议。"
  ) {
    try {
      const { text } = await generateText({
        model: this.model,
        prompt: query,
        system: system,
      });
      return text;
    } catch (error) {
      console.error("LLM调用错误:", error);
      throw error;
    }
  }

  async json(
    query: string,
    system: string = "你是一个专业的营销分析师，擅长分析各种营销案例并提供深入的洞察和建议。",
    schema: ZodType
  ) {
    try {
      const { object } = await generateObject({
        model: this.model,
        prompt: query,
        system,
        schema,
      });
      return object;
    } catch (error) {
      console.error("LLM JSON调用错误:", error);
      throw error;
    }
  }

  async check(query: string, question: string) {
    try {
      const { object } = await generateObject({
        model: this.model,
        prompt: query,
        system: `你是一个专业的营销分析师，基于给出的判断标准： ${question}, 判断用户给出的内容是否符合要求,符合返回true, 否则false。返回json格式:
            {
            "checked":true
            }
            `,
        schema: z.object({
          checked: z.boolean(),
        }),
      });
      return object;
    } catch (error) {
      console.error("LLM Check调用错误:", error);
      throw error;
    }
  }
}
