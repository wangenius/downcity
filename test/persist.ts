import { Memory } from "../src/Memory.js";
import { promises as fs } from "fs";
import { SQLitePersistor } from "../src/store/SQLitePersistor.js";

function testPersistence() {
  console.log("开始测试持久化功能...");

  const filePath = "./test-sessions.db";

  try {
    // 删除旧的测试文件（如果存在）
    try {
      fs.unlink(filePath);
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    // 1. 创建启用持久化的Memory实例
    const memory = new Memory(new SQLitePersistor({ filePath: filePath }));

    console.log("初始会话数量:", memory.getStats().totalSessions);

    // 2. 创建测试会话并添加消息
    const session1 = memory.createSession();
    session1.messages.push({
      role: "user",
      content: "Hello World",
    });
    memory.updateSession(session1);
    console.log(`创建了新会话: ${session1.id}`);

    // 3. 创建更多会话以测试限制
    for (let i = 0; i < 3; i++) {
      const session = memory.createSession();
      console.log(`创建了自动会话: ${session.id}`);
    }

    console.log("当前会话数量:", memory.getStats().totalSessions);
    console.log(
      "所有会话 ID:",
      memory.getAllSessions().map((s) => s.id)
    );

    // 4. 创建新的Memory实例来测试加载
    console.log("\n--- 开始测试加载功能 ---");
    const memory2 = new Memory(new SQLitePersistor({ filePath: filePath }));

    console.log("重新加载后的会话数量:", memory2.getStats().totalSessions);
    console.log(
      "重新加载后的会话 ID:",
      memory2.getAllSessions().map((s) => s.id)
    );

    // 5. 验证加载的数据
    const loadedSession = memory2.getSession(session1.id);

    console.log(loadedSession);

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

    // 6. 清理测试数据
    console.log("\n--- 清理测试数据 ---");
    memory2.clear();
    console.log("测试完成，数据已清理");
  } catch (error) {
    console.error("测试过程中发生错误:", error);
  }
}

// 运行测试
testPersistence();
