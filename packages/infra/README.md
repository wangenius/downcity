# @downcity/infra

`@downcity/infra` 是 Downcity 的服务端运行时内核。

它负责这些共用能力：

- 挂载 `Service` / `AIService`
- 初始化内置 `products` / `env` 表
- 校验 `user_token` 和 `admin_secret_key`
- 暴露统一的 `/v1/*` HTTP 路由
- 提供 env、数据库、hook 和鉴权上下文

## 安装

```bash
pnpm add @downcity/infra
```

## 最小示例

```ts
import { InfraRuntime, AIService } from "@downcity/infra";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

const sqlite = new Database("./data.sqlite");
sqlite.pragma("journal_mode = WAL");

const db = Object.assign(drizzle(sqlite), {
  $client: { exec: (sql: string) => sqlite.exec(sql) },
});

const infra = new InfraRuntime({ db, dialect: "sqlite", raw: sqlite });

const ai = new AIService();
ai.use({
  id: "local-echo",
  name: "Local Echo",
  default: ["text"],
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

infra.use(ai);
```

启动 HTTP 服务：

```ts
import { serve } from "@hono/node-server";

await infra.health();
serve({ fetch: infra.router().fetch, port: 43127, hostname: "127.0.0.1" });
```

## InfraRuntime 说明文档

`infra.instruction()` 会返回当前 InfraRuntime 实例的聚合说明文档字符串，内容包含：

- InfraRuntime 的基本使用方式
- 当前已挂载的 service
- 每个模块需要的 env 配置
- 每个模块补充的使用说明

```ts
const text = await infra.instruction();
console.log(text);
```

如果你需要从远程管理端读取同一份说明，可以请求：

```txt
GET /v1/infra/instruction
```

这个接口只允许 `admin_secret_key` 访问，返回 `text/plain`。

## Service

`Service` 是一组 `Action` 的容器：

```ts
import { Service } from "@downcity/infra";

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

infra.use(notes);
```

InfraRuntime 会自动映射为：

- `POST /v1/notes/create`
- `GET /v1/notes/list`

## AIService

`AIService` 负责模型目录和模态路由：

```ts
import { AIService, Provider } from "@downcity/infra";

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
    default: ["text", "stream"],
  }),
);

infra.use(ai);
```

## 官方服务

官方服务用于封装多产品复用能力：

```ts
import { accountsService } from "@downcity/services";
import { usageService } from "@downcity/services";

infra.use(accountsService());
infra.use(usageService());
```

服务路由当前只支持：

- `GET`
- `POST`

## 鉴权语义

- 默认 action 需要 `user_token`
- `auth: ["admin"]` 只允许 `admin_secret_key`
- `auth: []` 表示免登录

对于用户侧请求，`user_token` 绑定 product 身份。如果请求体或 query 中传了 `product_id`，它必须与 token 里的 product 一致。

## 主要导出

- `InfraRuntime`
- `Service`
- `ServiceDefinition`
- `AIService`
- `Provider`
- `TokenSigner`
- `EnvService`
- `ProductsService`

## 文档

- 仓库首页：[downcity](https://github.com/wangenius/downcity)
- 文档目录：[homepage/content/docs](https://github.com/wangenius/downcity/tree/main/homepage/content/docs)
