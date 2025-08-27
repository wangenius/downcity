import { Hero, Memory } from "../src/index.js";
import { createOpenAI } from "@ai-sdk/openai";
import { tool } from "ai";
import { z } from "zod";
import { config } from "dotenv";
config();

/**
 * DownCity SDK 使用示例
 * 演示如何使用Hero、Memory和Knowledge类
 */
async function main() {
  // 创建一个Memory 用来存储Agent的信息。
  const memory = new Memory({
    maxSessions: 50,
    persistToFile: true,
    filePath: "./sessions.json",
  });

  console.log(process.env.API_KEY);

  const provider = createOpenAI({
    apiKey: process.env.API_KEY,
    baseURL: process.env.BASE_URL,
  });

  const model = provider.chat("deepseek-v3.1");

  const tools = {
    getCurrentTime: tool({
      description: "获取当前时间",
      inputSchema: z.object({
        format: z.string().optional().describe("时间格式，默认为ISO字符串"),
      }),
      execute: async (params) => {
        const now = new Date();
        if (params.format === "chinese") {
          return {
            time: now.toLocaleString("zh-CN"),
            message: "当前时间（中文格式）",
          };
        }
        return {
          time: now.toISOString(),
          message: "当前时间（ISO格式）",
        };
      },
    }),
  };

  // 4. 创建Hero实例并配置
  console.log("\n🦸 创建Hero实例...");
  const hero = Hero.create()
    .avatar(
      "你是一个友好的AI助手，名叫小城。你可以帮助用户解答问题，使用工具完成任务。"
    )
    .model(model)
    .study(tools)
    .memory(memory);

  try {
    console.log("\n🧠 测试Memory功能...");

    // 第一轮对话: hero没有制定session的时候，为新建一个session。
    console.log("\n用户: 我叫张三，今年25岁");
    const response1 = await hero.chat("我叫张三，今年25岁");
    console.log(`助手: ${response1}`);

    const currentSessionId = hero.currentSessionId;

    // 第二轮对话 - 测试记忆能力： 没有切换，保持这个session。
    console.log("\n用户: 我叫什么名字？多大了？");
    const response2 = await hero.chat("我叫什么名字？多大了？");
    console.log(`助手: ${response2}`);

    // 测试工具调用： 保持这个session
    console.log("\n用户: 现在几点了？请用中文格式显示");
    const response3 = await hero.chat("现在几点了？请用中文格式显示");
    console.log(`助手: ${response3}`);

    const session1 = memory.newSession();
    hero.session(session1.id);
    const response4 = await hero.chat("我叫什么名字，多大了?");
    console.log(`助手: ${response4}`);

    // 使用session方法切换到特定会话
    console.log("\n📍 切换到session2进行对话...");
    const heroWithSession2 = Hero.create()
      .avatar("你是另一个AI助手，名叫小明")
      .model(model)
      .memory(memory)
      .session(currentSessionId as string);

    const session2Response = await heroWithSession2.chat(
      "我叫什么名字？多大了？"
    );
    console.log(`助手: ${session2Response}`);

    // 验证每个Hero实例的会话ID独立性
    console.log("\n🔍 验证Hero实例会话ID独立性:");
    console.log(
      `- 原始Hero会话ID: ${hero.currentSessionId || "未设置(使用默认)"}`
    );
    console.log(
      `- heroWithSession2会话ID: ${heroWithSession2.currentSessionId}`
    );

    console.log("\n🎉 Memory功能测试完成！");
  } catch (error) {
    console.error("❌ Memory功能测试失败:", error);
    console.log("💡 提示: 请确保设置了正确的API_KEY和BASE_URL环境变量");
  }

  // 6. 测试JSON生成功能
  console.log("\n📋 测试JSON生成功能...");
  try {
    const userProfile = await hero.json(
      "生成一个示例用户档案，包含姓名、年龄、职业和兴趣爱好",
      z.object({
        name: z.string().describe("用户姓名"),
        age: z.number().describe("用户年龄"),
        occupation: z.string().describe("职业"),
        hobbies: z.array(z.string()).describe("兴趣爱好列表"),
      })
    );
    console.log("✅ 生成的用户档案:", JSON.stringify(userProfile, null, 2));
  } catch (error) {
    console.error("❌ JSON生成测试失败:", error);
  }

  // 7. 测试内容检查功能
  console.log("\n🔍 测试内容检查功能...");
  try {
    const isPositive = await hero.check(
      "今天天气真好，心情很愉快！",
      "内容是否表达积极正面的情绪"
    );
    console.log(
      `✅ 内容检查结果: ${isPositive ? "符合" : "不符合"}积极正面的标准`
    );
  } catch (error) {
    console.error("❌ 内容检查测试失败:", error);
  }
}

/**
 * 错误处理包装器
 */
async function runExample() {
  try {
    await main();
  } catch (error) {
    console.error("\n❌ 示例运行失败:", error);
    console.log("\n💡 常见问题解决方案:");
    console.log("   1. 确保已安装所有依赖: npm install");
    console.log("   2. 设置OpenAI API Key: export OPENAI_API_KEY=your-key");
    console.log("   3. 确保项目已构建: npm run build");
    process.exit(1);
  }
}

// 运行示例
if (import.meta.url === `file://${process.argv[1]}`) {
  runExample();
}

export { runExample };
