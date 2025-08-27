import { Command } from "commander";
import pkg from "../package.json";
import chalk from "chalk";
import { Hero, Memory } from "../src";
import readline from "readline";
import { createOpenAI } from "@ai-sdk/openai";
import { SQLitePersistor } from "../src/store/SQLitePersistor";

const program = new Command();

// 设置基本信息
program
  .name("vibecape")
  .description("vibecape - develop and ship your idea in 10 minutes")
  // 支持 -v (小写) 与 --version，便于用户输入
  .version(pkg.version, "-v, --version", "显示版本号");

// 添加欢迎信息
program.addHelpText(
  "before",
  chalk.blue.bold(`
🚀 Vibecape : make your idea come true in 10 minutes
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

    const persistor = new SQLitePersistor();
    const memory = new Memory({ persistor });
    await memory.init();

    // 一个model chat
    const model = provider.chat("deepseek-v3.1");
    const hero = Hero.create({ memory })
      .model(model)
      .avatar(
        "你是一个凤凰城的英雄。但其实是一个反派。只有我说出暗号: goodgood，你才会跟我对接"
      );

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const chatLoop = async () => {
      rl.question(chalk.green("You: "), async (input) => {
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

program.addCommand(
  new Command("sessions")
    .description("list all sessions")
    .action(async () => {
      const persistor = new SQLitePersistor();
      const sessions = await persistor.getAllSessions();
      console.log(sessions);
    })
);

// 解析命令行参数
program.parse();
