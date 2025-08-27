import { tool } from "ai";
import { Hero, Memory, Knowledge } from "./src/index.js";
import { createOpenAI } from "@ai-sdk/openai";
import z from "zod";

// 示例：如何使用 DownCity 框架
async function main() {
  console.log("🏰 DownCity Framework Example");
  console.log("================================\n");

  const DASHSCOPE_API_KEY = "sk-2a6aab8ec65f4ddab3b0a991cf0911b4";
  const DASHSCOPE_BASE_URL =
    "https://dashscope.aliyuncs.com/compatible-mode/v1";

  // 1. 创建英雄
  const hero = Hero.create();

  // 2. 设置英雄身份
  hero.avatar("我是一个专业的编程助手，擅长帮助开发者解决技术问题");

  const qwen = createOpenAI({
    apiKey: DASHSCOPE_API_KEY,
    baseURL: DASHSCOPE_BASE_URL,
  });
  hero.model(qwen.chat("qwen-plus"));

  hero.study({
    current_time: tool({
      description: "如果需要了解当前的时间的话，调用此函数",
      inputSchema: z.object({
        format: z.string().optional(),
      }),
      execute: async () => {
        return new Date().toLocaleString();
      },
    }),
  });

  const res = await hero.chat("你好，现在几点了？");
  console.log("hero:", res);

  // // 4. 创建知识库（集成Chroma向量数据库）
  // const knowledge = Knowledge.create({
  //   categories: ["programming", "api", "documentation"],
  //   vectorDimension: 1536,
  //   similarityThreshold: 0.8,
  //   chroma: {
  //     collection: "downcity_knowledge",
  //     persistPath: "./chroma_db",
  //   },
  //   localFile: "./knowledge.json",
  // });

  // // 添加知识条目
  // knowledge.addKnowledge({
  //   title: "TypeScript 基础",
  //   content:
  //     "TypeScript 是 JavaScript 的超集，添加了静态类型检查。它提供了类型安全、更好的IDE支持和编译时错误检查。",
  //   category: "programming",
  //   tags: ["typescript", "javascript", "programming"],
  // });

  // knowledge.addKnowledge({
  //   title: "React Hooks",
  //   content:
  //     "React Hooks 是 React 16.8 引入的新特性，允许在函数组件中使用状态和其他React特性。常用的hooks包括useState、useEffect、useContext等。",
  //   category: "programming",
  //   tags: ["react", "hooks", "javascript"],
  // });

  // knowledge.addKnowledge({
  //   title: "REST API 设计原则",
  //   content:
  //     "REST API 设计应遵循统一接口、无状态、可缓存、分层系统等原则。使用HTTP方法（GET、POST、PUT、DELETE）来操作资源。",
  //   category: "api",
  //   tags: ["rest", "api", "http"],
  // });

  // // 5. 让英雄学习知识库操作工具
  // const knowledgeTools = knowledge.tools();
  // hero.study(knowledgeTools);

  // // 6. 创建记忆系统
  // const memory = new Memory({
  //   maxSessions: 50,
  //   persistToFile: false,
  // });

  // // 7. 设置记忆和会话
  // hero.memory(memory);
  // hero.session(memory.lastSession());

  // // 8. 启动英雄
  // await hero.ready(5000);
  // const tools = knowledge.tools();

  // console.log("工具:", tools);
  // // 12. 演示会话管理
  // console.log("\n🧠 会话管理演示:");
  // const session1 = memory.newSession();
  // console.log(`创建新会话: ${session1.id}`);

  // const session2 = memory.newSession();
  // console.log(`创建另一个会话: ${session2.id}`);

  // console.log(`总会话数: ${memory.getAllSessions().length}`);

  // // 13. 演示知识搜索（向量搜索）
  // console.log("\n🔍 知识搜索演示:");
  // const searchResults = await knowledge.searchKnowledge("TypeScript");
  // console.log(`搜索 'TypeScript' 找到 ${searchResults.length} 条结果`);
  // if (searchResults.length > 0) {
  //   console.log(
  //     `- ${searchResults[0].title}: ${searchResults[0].content.substring(
  //       0,
  //       100
  //     )}...`
  //   );
  // }

  // // 演示React相关搜索
  // const reactResults = await knowledge.searchKnowledge("React");
  // console.log(`搜索 'React' 找到 ${reactResults.length} 条结果`);
  // if (reactResults.length > 0) {
  //   console.log(
  //     `- ${reactResults[0].title}: ${reactResults[0].content.substring(
  //       0,
  //       100
  //     )}...`
  //   );
  // }

  // // 按分类搜索
  // const programmingResults = await knowledge.searchKnowledge(
  //   "编程",
  //   "programming"
  // );
  // console.log(`编程分类搜索结果: ${programmingResults.length} 个条目`);
  // const apiResults = await knowledge.searchKnowledge("API", "api");
  // console.log(`API分类搜索结果: ${apiResults.length} 个条目`);

  // // 演示文本搜索（禁用向量搜索）
  // const textResults = await knowledge.searchKnowledge("函数", undefined, false);
  // console.log(`文本搜索结果: ${textResults.length} 个条目`);

  // console.log("\n✅ 示例完成！");
}

// 运行示例
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };
