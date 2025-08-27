import { Hero, Memory } from "./src/index.js";
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
  console.log("🏰 DownCity SDK 示例开始");

  // 1. 创建记忆系统
  console.log("\n📚 创建记忆系统...");
  const memory = new Memory({
    maxSessions: 50,
    persistToFile: true,
    filePath: "./sessions.json",
  });

  // 创建一个新会话
  const session = memory.newSession("example-session");
  console.log(`✅ 创建会话: ${session.id}`);
  const qwen = createOpenAI({
    apiKey: process.env.API_KEY,
    baseURL: process.env.BASE_URL,
  });
  const qwenModel = qwen.chat("qwen-plus");
  //   const qwenEmbeddingModel = qwen.embedding("text-embedding-v4");

  const customTools = {
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
    .model(qwenModel)
    .study(customTools)
    .memory(memory);

  try {
    // 5. 测试Memory功能 - 多轮对话记忆
    console.log("\n🧠 测试Memory功能...");
    
    // 第一轮对话
    console.log("\n用户: 我叫张三，今年25岁");
    const response1 = await hero.chat("我叫张三，今年25岁");
    console.log(`助手: ${response1}`);
    
    // 第二轮对话 - 测试记忆能力
    console.log("\n用户: 我叫什么名字？多大了？");
    const response2 = await hero.chat("我叫什么名字？多大了？");
    console.log(`助手: ${response2}`);
    
    // 测试工具调用
    console.log("\n用户: 现在几点了？请用中文格式显示");
    const response3 = await hero.chat("现在几点了？请用中文格式显示");
    console.log(`助手: ${response3}`);
    
    // 显示当前会话的消息历史
    console.log("\n📝 当前会话消息历史:");
    if (session.messages.length > 0) {
      session.messages.forEach((msg, index) => {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        console.log(`${index + 1}. [${msg.role}] ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`);
      });
    }
    
    // 测试Memory统计功能
    console.log("\n📊 Memory统计信息:");
    const stats = memory.getStats();
    console.log(`- 总会话数: ${stats.totalSessions}`);
    console.log(`- 总消息数: ${stats.totalMessages}`);
    console.log(`- 最后活动时间: ${stats.lastActivity?.toLocaleString('zh-CN')}`);
    
    // 测试创建多个会话
    console.log("\n🔄 测试多会话管理...");
    const session2 = memory.newSession("test-session-2");
    const session3 = memory.newSession("test-session-3");
    
    console.log(`✅ 创建了额外的会话: ${session2.id}, ${session3.id}`);
    console.log(`📋 所有会话列表:`);
    const allSessions = memory.getAllSessions();
    allSessions.forEach((s, index) => {
      console.log(`  ${index + 1}. ${s.id} (${s.messages.length} 条消息, 创建于 ${s.createdAt.toLocaleString('zh-CN')})`);
    });
    
    // 测试会话切换
    console.log("\n🔀 测试会话切换...");
    
    // 使用session方法切换到特定会话
    console.log("\n📍 切换到session2进行对话...");
    const heroWithSession2 = Hero.create()
      .avatar("你是另一个AI助手，名叫小明")
      .model(qwenModel)
      .memory(memory)
      .session(session2.id);
    
    const session2Response = await heroWithSession2.chat("你好，我是在session2中的用户，我叫李四");
    console.log(`Session2助手回复: ${session2Response}`);
    
    // 切换到session3进行对话
    console.log("\n📍 切换到session3进行对话...");
    const heroWithSession3 = Hero.create()
      .avatar("你是第三个AI助手，名叫小红")
      .model(qwenModel)
      .memory(memory)
      .session(session3.id);
    
    const session3Response = await heroWithSession3.chat("你好，我是在session3中的用户，我叫王五");
    console.log(`Session3助手回复: ${session3Response}`);
    
    // 验证会话隔离 - 回到原始会话
    console.log("\n🔄 验证会话隔离 - 回到原始会话...");
    const backToOriginal = await hero.chat("我刚才告诉你我叫什么名字？");
    console.log(`原始会话助手回复: ${backToOriginal}`);
    
    // 验证session2记住了李四
    console.log("\n🔄 验证session2记住了李四...");
    const session2Memory = await heroWithSession2.chat("我刚才告诉你我叫什么名字？");
    console.log(`Session2助手回复: ${session2Memory}`);
    
    // 测试获取特定会话
    console.log("\n🔍 测试会话检索...");
    const retrievedSession = memory.getSession("example-session");
    if (retrievedSession) {
      console.log(`✅ 成功检索到会话 '${retrievedSession.id}', 包含 ${retrievedSession.messages.length} 条消息`);
    }
    
    // 测试会话导出和导入
    console.log("\n💾 测试会话导出/导入...");
    const exportedData = memory.export();
    console.log(`✅ 导出数据包含 ${exportedData.sessions.length} 个会话`);
    
    // 创建新的Memory实例并导入数据
    const newMemory = new Memory();
    newMemory.import(exportedData);
    const importStats = newMemory.getStats();
    console.log(`✅ 导入成功，新Memory包含 ${importStats.totalSessions} 个会话，${importStats.totalMessages} 条消息`);
     
     // 测试会话删除功能
     console.log("\n🗑️  测试会话删除...");
     const deleteResult = memory.deleteSession("test-session-3");
     console.log(`✅ 删除会话结果: ${deleteResult ? '成功' : '失败'}`);
     
     const finalStats = memory.getStats();
     console.log(`📊 删除后统计: ${finalStats.totalSessions} 个会话，${finalStats.totalMessages} 条消息`);
     
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
