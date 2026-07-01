# @downcity/city

`@downcity/city` 是 Downcity 的服务端运行时内核。

它负责这些共用能力：

- 挂载 `Service` / `AIService`
- 初始化内置 `cities` / `env` 表
- 校验 `user_token` 和 `admin_secret_key`
- 暴露统一的 `/v1/*` HTTP 路由
- 提供 env、数据库、hook 和鉴权上下文

## 安装

```bash
pnpm add @downcity/city
```

## 最小示例

```ts
import { Federation, AIService } from "@downcity/city";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

const sqlite = new Database("./data.sqlite");
sqlite.pragma("journal_mode = WAL");

const db = Object.assign(drizzle(sqlite), {
  $client: { exec: (sql: string) => sqlite.exec(sql) },
});

const base = new Federation({ db, dialect: "sqlite", raw: sqlite });

const ai = new AIService();
ai.use({
  id: "local-echo",
  name: "Local Echo",
  actions: {
    text: async (ctx) => ({
      id: crypto.randomUUID(),
      role: "assistant",
      parts: [
        {
          type: "text",
          text: String(ctx.input.prompt ?? ""),
          state: "done",
        },
      ],
    }),
  },
});

base.use(ai);
```

启动 HTTP 服务：

```ts
import { serve } from "@hono/node-server";

await base.health();
serve({ fetch: (request) => base.fetch(request), port: 43127, hostname: "127.0.0.1" });
```

## HTTP Middleware

Federation 级 middleware 会在内部路由和 Action body 读取之前执行。`@downcity/city` 只提供 middleware 接口，不内置 CORS、安全响应头、body 大小限制、限流、超时等策略实现；这些策略应由具体调用方按自己的 HTTP 运行环境提供。

```ts
base.middle(async (ctx, next) => {
  const origin = ctx.request.headers.get("origin");
  if (ctx.request.method === "OPTIONS" && origin === "https://app.example.com") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const response = await next();
  if (!origin) return response;

  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
```

## City 说明文档

`base.instruction()` 会返回当前 Federation 实例的聚合说明文档字符串，内容包含：

- Federation 的基本使用方式
- 当前已挂载的 service
- 每个模块需要的 env 配置
- 每个模块补充的使用说明

```ts
const text = await base.instruction();
console.log(text);
```

如果你需要从远程管理端读取同一份说明，可以请求：

```txt
GET /v1/federation/instruction
```

这个接口只允许 `admin_secret_key` 访问，返回 `text/plain`。

## Service

`Service` 是一组 `Action` 的容器：

```ts
import { Service } from "@downcity/city";

const notes = new Service({ id: "notes", name: "Notes" });

notes.action("create", async (ctx) => {
  return {
    ok: true,
    title: String(ctx.input.title ?? ""),
  };
});

notes.action("list", async () => {
  return { items: [] };
}, { method: "GET", auth: ["admin"] });

base.use(notes);
```

City 会自动映射为：

- `POST /v1/notes/create`
- `GET /v1/notes/list`

## AIService

`AIService` 负责模型目录和模态路由：

```ts
import { AIService, Provider } from "@downcity/city";

const deepseek = new Provider("deepseek", {
  baseURL: "https://api.deepseek.com/v1",
  envKey: "DEEPSEEK_API_KEY",
  text: myTextAction,
  stream: myStreamAction,
});

const ai = new AIService();
ai.use(
  deepseek.model({
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
  }),
);

base.use(ai);
```

## 官方服务

官方服务用于封装多 city 复用能力：

```ts
import { accountsService } from "@downcity/services";
import { usageService } from "@downcity/services";

base.use(accountsService());
base.use(usageService());
```

服务路由当前只支持：

- `GET`
- `POST`

## 鉴权语义

- 默认 action 需要 `user_token`
- `auth: ["admin"]` 只允许 `admin_secret_key`
- `auth: []` 表示免登录

对于用户侧请求，`user_token` 绑定 city 身份。如果请求体或 query 中传了 `city_id`，它必须与 token 里的 city 一致。

## 主要导出

- `City`
- `Federation`
- `Service`
- `ServiceDefinition`
- `AIService`
- `Provider`
- `CityModel`
- `CityModelDescriptor`
- `TokenSigner`
- `EnvService`
- `CitiesService`

## City 模型目录

`User City` 的 `client.ai.listModels()` 返回 `ModelCatalog`。目录中的模型是 `CityModel`，可以直接用于 City 的 AI 调用，也可以传给支持 CityModel 的 Agent SDK：

```ts
const catalog = await client.ai.listModels();
const model = catalog.get("deepseek-v4-flash");
if (!model) throw new Error("model not found");

await client.ai.text({
  model,
  prompt: "hello",
});
```

## 文档

- 仓库首页：[downcity](https://github.com/wangenius/downcity)
- 文档目录：[homepage/content/docs](https://github.com/wangenius/downcity/tree/main/homepage/content/docs)
