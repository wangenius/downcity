#!/usr/bin/env bun
import { Command } from "commander";
import pkg from "../../package.json" with { type: "json" };
import chalk from "chalk";
import { Hero, Room } from "../index.js";
import readline from "readline";
import { log } from "console";
import z from "zod";
import { SQLiteRoomPersistor } from "../room/Room.js";
import { skill } from "../skill/Skill.js";

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

    if (!process.env.DOWNCITY_API_KEY) {
      console.log(chalk.red("请设置 DOWNCITY_API_KEY 环境变量"));
      return;
    }

    if (!process.env.DOWNCITY_BASE_URL) {
      console.log(chalk.red("请设置 DOWNCITY_BASE_URL 环境变量"));
      return;
    }

    // 创建一个room: 用来控制shot
    const room = new Room(
      new SQLiteRoomPersistor()
    );

    const skills = {
      get_current_time: skill({
        description: "获取当前时间",
        inputSchema: z.object({}),
        execute: () => {
          return new Date().toLocaleString();
        },
      }),
    };

    const hero = Hero.create()
      .room(room)
      .study(skills)

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const chatLoop = async () => {
      rl.question(chalk.green("You: "), async (input) => {
        if (input.trim() === "ls") {
          log(hero.shots());
          chatLoop();
          return;
        }
        if (input.trim() === "current") {
          console.log(hero.shot.id);
          console.log(hero.shot.messages);
          chatLoop();
          return;
        }
        if (input.trim() === "new") {
          const shot = hero.renew();
          console.log(shot);
          chatLoop();
          return;
        }
        if (input.trim() === "clear") {
          hero.clear();
          chatLoop();
          return;
        }
        if (input.startsWith("switch")) {
          const shotId = input.split(" ")[1];
          hero.switch(shotId);
          chatLoop();
          return;
        }
        if (input.toLowerCase() === "exit") {
          rl.close();
          return;
        }
        const response = await hero.text(input);
        console.log(chalk.blue("Bot:"), response);
        chatLoop();
      });
    };

    chatLoop();
  })
);

// 解析命令行参数
program.parse();
