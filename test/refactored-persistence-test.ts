import { Memory } from "../src/Memory.js";
import { Session } from "../src/Session.js";
import { promises as fs } from "fs";

async function testPersistence() {
  console.log("开始测试持久化功能...");

  const filePath = "./test-sessions.json";

  try {
    // 删除旧的测试文件（如果存在）
    try {
      await fs.unlink(filePath);
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    // 1. 创建启用持久化的Memory实例
    const memory = new Memory({
      persistToFile: true,
      filePath: filePath,
      maxSessions: 5,
    });

    // 等待可能的异步加载完成
    await new Promise((resolve) => setTimeout(resolve, 200));

    console.log("初始会话数量:", memory.getStats().totalSessions);

    // 2. 创建测试会话并添加消息
    const session1 = memory.newSession();
    session1.messages.push({
      role: "user",
      content: "Hello World",
    });
    memory.updateSession(session1);
    console.log(`创建了新会话: ${session1.id}`);

    // 3. 创建更多会话以测试限制
    for (let i = 0; i < 3; i++) {
      const session = memory.newSession();
      console.log(`创建了自动会话: ${session.id}`);
    }

    console.log("当前会话数量:", memory.getStats().totalSessions);
    console.log(
      "所有会话 ID:",
      memory.getAllSessions().map((s) => s.id)
    );

    // 4. 手动保存数据
    await memory.save();
    console.log("数据已保存到文件");

    // 5. 创建新的Memory实例来测试加载
    console.log("\n--- 开始测试加载功能 ---");
    const memory2 = new Memory({
      persistToFile: true,
      filePath: filePath,
    });

    // 等待异步加载完成
    await new Promise((resolve) => setTimeout(resolve, 200));

    console.log("重新加载后的会话数量:", memory2.getStats().totalSessions);
    console.log(
      "重新加载后的会话 ID:",
      memory2.getAllSessions().map((s) => s.id)
    );

    // 6. 验证加载的数据
    const loadedSession = memory2.getSession(session1.id);
    if (loadedSession) {
      console.log("测试会话已成功加载");
      if (
        loadedSession.messages.length > 0 &&
        loadedSession.messages[0].content === "Hello World"
      ) {
        console.log("测试会话的消息内容验证成功");
      } else {
        console.error("错误：测试会话的消息内容不匹配");
      }
    } else {
      console.error("错误：测试会话未找到");
    }

    // 7. 清理测试数据
    console.log("\n--- 清理测试数据 ---");
    await memory2.clear();
    await memory2.save();
    console.log("测试完成，数据已清理");
  } catch (error) {
    console.error("测试过程中发生错误:", error);
  } finally {
    // 再次尝试删除测试文件以确保清理
    try {
      await fs.unlink(filePath);
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        console.error("清理测试文件时出错:", error);
      }
    }
  }
}

// 运行测试
testPersistence().catch(console.error);
