import { Hero } from "../hero/Hero.js";
import { DEFAULT_DOWNCITY_EMBEDDING_MODEL } from "../model/model.js";
import { Codex } from "./Codex.js";

// 基本使用示例
async function basicExample() {
  console.log("=== 基本使用示例 ===");
  
  // 1. 创建 Codex 实例（同步创建）
  const codex = Codex.create({
    model: DEFAULT_DOWNCITY_EMBEDDING_MODEL,
    path: "./data/codex", // 可选，默认使用 ~/.downcity/codex/lancedb
    tableName: "knowledge" // 可选，默认为 'knowledge'
  });
  
  // 2. 添加知识内容（简化的API）
  const id1 = await codex.add("JavaScript是一种编程语言", { type: "knowledge", category: "programming" });
  const id2 = await codex.add("Python是一种高级编程语言", { type: "knowledge", category: "programming" });
  const id3 = await codex.add("今天天气很好", { type: "daily", mood: "positive" });
  
  console.log("添加的内容ID:", { id1, id2, id3 });
  
  // 3. 搜索相关内容（简化的API）
  const results = await codex.search("编程语言", { limit: 2 });
  console.log("搜索结果:", results.map(r => ({ content: r.content, distance: r.distance })));
  
  // 4. 按类型搜索
  const knowledgeResults = await codex.searchByType("语言", "knowledge", 3);
  console.log("知识类型搜索结果:", knowledgeResults.map(r => r.content));
  
  // 5. 关闭连接
  codex.close();
}

// 批量操作示例
async function batchExample() {
  console.log("\n=== 批量操作示例 ===");
  
  const codex = Codex.create({
    model: DEFAULT_DOWNCITY_EMBEDDING_MODEL,
    tableName: "batch_demo"
  });
  
  // 批量添加内容
  const items = [
    { content: "React是一个JavaScript库", metadata: { type: "tech", framework: "react" } },
    { content: "Vue是一个渐进式框架", metadata: { type: "tech", framework: "vue" } },
    { content: "Angular是一个完整的框架", metadata: { type: "tech", framework: "angular" } }
  ];
  
  const ids = await codex.batchAdd(items);
  console.log("批量添加的ID:", ids);
  
  // 搜索框架相关内容
  const frameworkResults = await codex.search("前端框架", { limit: 3 });
  console.log("框架搜索结果:", frameworkResults.map(r => r.content));
  
  codex.close();
}

// 高级搜索示例
async function advancedSearchExample() {
  console.log("\n=== 高级搜索示例 ===");
  
  const codex = Codex.create({
    model: DEFAULT_DOWNCITY_EMBEDDING_MODEL,
    tableName: "advanced_demo"
  });
  
  // 添加一些测试数据
  await codex.add("机器学习是人工智能的一个分支", { type: "ai", difficulty: "intermediate" });
  await codex.add("深度学习使用神经网络", { type: "ai", difficulty: "advanced" });
  await codex.add("监督学习需要标注数据", { type: "ai", difficulty: "beginner" });
  
  // 使用search方法进行查询
  const complexResults = await codex.search("学习", {
    limit: 3,
    distanceThreshold: 0.8
  });
  
  console.log("复杂查询结果:", complexResults.map(r => ({
    content: r.content,
    metadata: r.metadata,
    distance: r.distance
  })));
  
  codex.close();
}

// 与Hero集成示例
async function heroIntegrationExample() {
  console.log("\n=== Hero集成示例 ===");
  
  const codex = Codex.create({
    model: DEFAULT_DOWNCITY_EMBEDDING_MODEL,
    tableName: "hero_knowledge"
  });
  
  // 添加Hero的知识库
  await codex.add("Hero是downcity中的智能代理", { type: "hero", category: "concept" });
  await codex.add("Hero可以学习技能和工具", { type: "hero", category: "capability" });
  await codex.add("Hero可以进入房间进行对话", { type: "hero", category: "interaction" });
  
  // 创建Hero并让其学习codex
  // const hero = Hero.create();
  // hero.study(codex.lesson()); // 这里展示如何让Hero学习知识库
  
  // 模拟Hero查询知识
  const heroQuery = await codex.search("Hero的能力", { limit: 2 });
  console.log("Hero相关知识:", heroQuery.map(r => r.content));
  
  codex.close();
}

// 运行所有示例
async function runAllExamples() {
  try {
    await basicExample();
    await batchExample();
    await advancedSearchExample();
    await heroIntegrationExample();
    
    console.log("\n所有示例运行完成！");
  } catch (error) {
    console.error("示例运行出错:", error);
  }
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}

export {
  basicExample,
  batchExample,
  advancedSearchExample,
  heroIntegrationExample,
  runAllExamples
};

