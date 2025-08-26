# 🏰 DownCity

> *"在数字世界的城市中，每个AI都是一位英雄"*

一个基于游戏化思维设计的AI智能体框架，让AI开发变得像RPG冒险一样有趣！

## ✨ 核心理念

在DownCity的世界里：
- 🦸‍♂️ **Hero（英雄）** - 你的AI智能体，拥有独特的能力和使命
- ⚡ **Reactor（反应器）** - 英雄的能量源泉，驱动思考与行动
- 🧠 **Memory（记忆）** - 英雄的经历与智慧积累
- 🔨 **Forge（工坊）** - 锻造技能与工具的神秘之地

## 🚀 安装

```bash
npm install downcity
```

## 🎮 快速开始

### 创造你的第一个英雄

```ts
import { Hero, Forge, Reactor, Memory } from "downcity";

// 创建反应器 - 英雄的能量源
export class OpenAIReactor extends Reactor {
  constructor() {
    super("gpt-3.5-turbo");
  }
}

const matrix = new Matrix();


// 初始化组件
const reactor = new OpenAIReactor(); // 能量反应器

const forge = new Forge();           // 技能工坊

// 🌟 英雄诞生！
const hero = new Hero(reactor, matrix);

// 英雄觉醒
await hero.born();

// 🎯 开始冒险
const result = await hero.act("帮我写一首关于勇气的诗");
console.log(result);
```

### 🛠️ 在工坊中锻造技能

```ts
// 为英雄锻造专属技能
const poetrySkill = forge.createSkill({
  name: "诗歌创作",
  description: "创作优美的诗歌",
  systemPrompt: "你是一位才华横溢的诗人，擅长创作各种风格的诗歌"
});

// 英雄学习新技能
hero.learnSkill(poetrySkill);

// 使用特定技能
const poem = await hero.useSkill("诗歌创作", "写一首关于春天的诗");
```

### 🧠 记忆与成长

```ts
// 英雄会记住每次冒险
const conversation = await hero.chat([
  "你好，我是新手冒险者",
  "能教我一些生存技巧吗？",
  "谢谢你的建议！"
]);

// 查看英雄的记忆
const memories = hero.getMemories();
console.log("英雄的冒险记录:", memories);
```

## 🏗️ 架构设计

```
🏰 DownCity 世界
├── 🦸‍♂️ Hero (英雄)
│   ├── born() - 英雄觉醒
│   ├── act() - 执行任务
│   ├── chat() - 对话交流
│   ├── learnSkill() - 学习技能
│   └── useSkill() - 使用技能
├── ⚡ Reactor (反应器)
│   ├── OpenAIReactor
│   ├── ClaudeReactor
│   └── CustomReactor
├── 🧠 Memory (记忆)
│   ├── shortTerm - 短期记忆
│   ├── longTerm - 长期记忆
│   └── episodic - 情节记忆
└── 🔨 Forge (工坊)
    ├── createSkill() - 创造技能
    ├── createTool() - 打造工具
    └── enchant() - 附魔增强
```

## 🎯 高级用法

### 多英雄协作

```ts
// 创建英雄小队
const warrior = new Hero(new OpenAIReactor(), "战士");
const mage = new Hero(new ClaudeReactor(), "法师");
const healer = new Hero(new GeminiReactor(), "治疗师");

// 组建冒险队伍
const party = new Party([warrior, mage, healer]);

// 团队协作完成任务
const result = await party.collaborate("设计一个完整的产品方案");
```

### 自定义反应器

```ts
class CustomReactor extends Reactor {
  constructor() {
    super({
      model: "your-custom-model",
      temperature: 0.7,
      maxTokens: 2000
    });
  }
  
  // 重写反应逻辑
  async react(input: string): Promise<string> {
    // 你的自定义逻辑
    return await this.process(input);
  }
}
```

## 🌟 特性

- 🎮 **游戏化体验** - 让AI开发充满乐趣
- 🧩 **模块化设计** - 灵活组合，随心定制
- 🚀 **简单易用** - 直观的API，快速上手
- 🔧 **高度可扩展** - 支持自定义组件
- 💾 **智能记忆** - 上下文感知与学习能力
- 🛠️ **丰富工具** - 内置常用技能与工具

## 📚 示例项目

- 🤖 [智能客服英雄](./examples/customer-service)
- 📝 [内容创作法师](./examples/content-creator)
- 🔍 [数据分析师](./examples/data-analyst)
- 🎨 [创意设计师](./examples/creative-designer)

## 🤝 贡献

欢迎加入DownCity的建设！无论是新功能、bug修复还是文档改进，我们都热烈欢迎。

## 📄 许可证

MIT License - 详见 [LICENSE](./LICENSE) 文件。

---

*在DownCity，每一行代码都是一次冒险，每个英雄都有自己的传奇！* ⚔️✨
