# 🏰 DownCity

> _"在数字世界的城市中，每个 AI 都是一位英雄"_

一个基于游戏化思维设计的 AI 智能体框架，让 AI 开发变得像 RPG 冒险一样有趣！

## 🚀 安装

```bash
npm install downcity
```

## 🎮 快速开始

### 创造你的第一个英雄

```ts
import { Hero, Knowledge, Model } from "downcity";

const hero = Hero.create();

// system prompt
hero.avatar("我是一个新的英雄");
// 设置ai-sdk的tool
hero.model();
// 学习 ai-sdk的tool
hero.study();

// 准备好: 直接暴露一个端口
await hero.ready(5000);

const memory = new Memory();
hero.memory(memory);
hero.session(memory.lastSession());
const res = await hero.chat("你好");
console.log(res);
```

```typescript
import { Knowledge, Memory } from "downcity";

const knowledge = Knowledge.create();

const tools = knowledge.tool();

const memory = new Memory();

hero.memory(memory);

// ai-sdk 的tool
const tool = createTool({});

hero.study(tools);
hero.study(tool);

const hero2 = new Hero();
hero2.memory(memory);
hero2.session(memory.newSession());
```
