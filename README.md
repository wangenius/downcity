# 🏰 DownCity

> _"在数字世界的城市中，每个 AI 都是一位英雄"_

一个基于游戏化思维设计的 AI 智能体框架，让 AI 开发变得像 RPG 冒险一样有趣！

## 🚀 安装

```bash
npm install downcity
```

## 🎮 快速开始

```ts
// 创建一个provider
const provider = createOpenAI({
  apiKey: process.env.DOWNCITY_API_KEY,
  baseURL: process.env.DOWNCITY_BASE_URL,
});

// 一个model chat
const model = provider.chat("deepseek-v3.1");

// 创建一个hero
const hero = Hero.create().avatar("我是一个新的英雄").model(model);

const res = await hero.chat("hello, 你好👋");
console.log(`hero:${res}`);
```

更多示例请参考 [docs](https://downcity.wangenius.com/docs) 目录。

## cli

```ts
npm i -g downcity
```

```bash
doci config # 配置apiKey等
doci enter
```
