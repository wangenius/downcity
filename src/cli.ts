import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import chalk from "chalk";
import { Hero, Memory } from "./index.js";
import readline from "readline";
import { createOpenAI } from "@ai-sdk/openai";
import { log } from "console";
import { SQLitePersistor } from "./store/SQLitePersistor.js";
import { tool } from "ai";
import z from "zod";

const program = new Command();

// 设置基本信息
program
  .name("downcity")
  .description("downcity - talk with your hero")
  // 支持 -v (小写) 与 --version，便于用户输入
  .version(pkg.version, "-v, --version", "显示版本号");

// 添加欢迎信息
program.addHelpText(
  "before",
  chalk.blue.bold(`
🚀 DownCity : make your idea come true in 10 minutes
`)
);

// 注册命令
program.addCommand(
  new Command("chat").description("chat with the bot").action(async () => {
    // 创建一个provider
    const provider = createOpenAI({
      apiKey: process.env.API_KEY,
      baseURL: process.env.BASE_URL,
    });

    const memory = new Memory(
      new SQLitePersistor({
        filePath: "./test.db",
      })
    );

    const tools = {
      get_current_time: tool({
        description: "获取当前时间",
        inputSchema: z.object({}),
        execute: () => {
          return new Date().toLocaleString();
        },
      }),
    };

    // 一个model chat
    const model = provider.chat("deepseek-v3.1");
    const hero = Hero.create()
      .model(model)
      .memory(memory)
      .study(tools)
      .avatar("你是一个助手");

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const chatLoop = async () => {
      rl.question(chalk.green("You: "), async (input) => {
        if (input.trim() === "ls") {
          log(hero.sessions());
          chatLoop();
          return;
        }
        if (input.trim() === "current") {
          console.log(hero.session.id);
          console.log(hero.session.messages);
          chatLoop();
          return;
        }
        if (input.trim() === "new") {
          const session = hero.renew();
          console.log(session);
          chatLoop();
          return;
        }
        if (input.trim() === "clear") {
          hero.clear();
          chatLoop();
          return;
        }
        if (input.startsWith("switch")) {
          const sessionId = input.split(" ")[1];
          hero.switch(sessionId);
          chatLoop();
          return;
        }
        if (input.toLowerCase() === "exit") {
          rl.close();
          return;
        }
        const response = await hero.chat(input);
        console.log(chalk.blue("Bot:"), response);
        chatLoop();
      });
    };

    chatLoop();
  })
);

// 解析命令行参数
program.parse();
