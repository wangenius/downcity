#!/usr/bin/env bun
import { Command } from "commander";
import pkg from "../../package.json" with { type: "json" };
import chalk from "chalk";
import { Hero, Vault } from "../index.js";
import readline from "readline";
import { createOpenAI } from "@ai-sdk/openai";
import { log } from "console";
import { tool } from "ai";
import z from "zod";
import { SQLiteVaultPersistor } from "../vault/Vault.js";

const program = new Command();

// 设置基本信息
program
  .name("downcity")
  .description("downcity - An open world productive game in terminal")
  .version(pkg.version, "-v, --version", "显示版本号");

// 添加欢迎信息
program.addHelpText(
  "before",
  chalk.blue.bold(`
🚀 DownCity : An open world productive game in terminal
`, chalk.blue.bold("Version: " + pkg.version))
);

// 注册命令
program.addCommand(
  new Command("enter").description("enter in this game").action(async () => {
    console.log("welcome to downcity!");
    console.log("letus punk!");    

    if (!process.env.API_KEY) {
      console.log(chalk.red("请设置 API_KEY 环境变量"));
      return;
    }

    if (!process.env.BASE_URL) {
      console.log(chalk.red("请设置 BASE_URL 环境变量"));
      return;
    }

    // 创建一个provider
    const provider = createOpenAI({
      apiKey: process.env.API_KEY,
      baseURL: process.env.BASE_URL,
    });
    // 一个model chat
    const model = provider.chat("qwen-turbo");

    // 创建一个vault: 用来控制session
    const vault = new Vault(
      new SQLiteVaultPersistor()
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

    const hero = Hero.create()
      .model(model)
      .vault(vault)
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
