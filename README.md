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
// 创建一个provider
const provider = createOpenAI({
  apiKey: process.env.API_KEY,
  baseURL: process.env.BASE_URL,
});

// 一个model chat
const model = provider.chat("deepseek-v3.1");

// 创建一个hero
const hero = Hero.create().avatar("我是一个新的英雄").model(model);

const res = await hero.chat("hello, 你好👋");
console.log(`hero:${res}`);
```

## 使用工具

```typescript
const tools: Record<string, Tool> = {
  // ai-sdk 的 tool
  get_current_time: tool({}),
};

hero.study(tools);
const res = await hero.chat("现在几点了？");
console.log(`hero:${res}`);
```

# Shot 与 Memory

Memory 是 Shot 的管理器。维护 hero/agent 的会话。

Hero 实例中会维护一个 Shot 对象。

当 hero 操作 shot 的时候， memory 中会操作 shot。

## Shot

## Memory

当不使用 memory 的时候。

```typescript
const hero = Hero.create().avatar("你是一个英雄").model(model);
const old_id = hero.shot.id;
// hero实例中的 _shot 是一个当前的shot.
const res = await hero.chat("你好, 我叫wangenius");
console.log(`hero:${res}`);
// 新建对话并且切换到新会话。 原来的会话放到的 memory 中管理。 renew 返回新建的会话id。
const id = hero.renew();
const res = await hero.chat("我叫什么？");
console.log(`hero:${res}`); // hero并不知道我叫什么，因为不知道。

// 切换到原来的会话中 hero 将 memory 中的对应的id 的shot 放到了 hero._shot 中。
hero.switch(old_id);
const res = await hero.chat("我叫什么？");
console.log(`hero:${res}`); // hero 知道我叫 wangenius。
```

以上使用， hero 实例中活创建默认的 `new Memory()`， 此时 Memory 的所有 shot 都在内存中维护。

且当某个 hero 的实例中的 shot 更新后，同步会更新到 memory 中。 但是注意： memory 中更新后，并不会更新到当前使用这个 shot 的实例。

```ts
hero.memory(new Memory());
```

以上是等价的。

```ts
// 切换会话
hero.switch("会话id");
// 新建会话并切换到新会话
hero.renew();
// 会话列表
hero.shots();
// 删除列表
hero.remove("会话id");
// 清除所有会话
hero.clear();
```

memory 可以在多个 hero 之间使用:

```ts
const memory = new Memory();
const hero1 = Hero.create().memory(memory);
const hero2 = Hero.create().memory(memory);
```

```ts
const memory1 = new Memory();
const hero1 = Hero.create().memory(memory1);

const memory2 = new Memory();
const hero2 = Hero.create().memory(memory2);
```

持久化存储。

```typescript
const persistor = new LibPersistor({
  filePath: "./memory.db",
});

const memory = new Memory(persistor);
hero.memory(memory);
```

当持久化存储的时候， 会将 shot 存储到对应的持久化数据库中。

此时 Memory 不会提前加载所有的数据库中的 shot。 只会打开对应的 shot 到内存中。 并且超过 20 个的时候，会关掉之前的。


# cli 工具