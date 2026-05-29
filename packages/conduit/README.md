# @downcity/conduit

`@downcity/conduit` 是 Downcity 的客户端 SDK。

它提供两类客户端：

- `UserClient`：给终端用户产品调用 InfraRuntime，也负责公开服务入口，例如登录、注册、webhook
- `AdminClient`：给可信后端管理 product、签发 `user_token`、维护 Runtime env

## 安装

```bash
pnpm add @downcity/conduit
```

## UserClient 调公开服务

```ts
import { UserClient } from "@downcity/conduit";

const guest = new UserClient({
  base_url: "http://127.0.0.1:3001",
});

const session = await guest.service("accounts").post("login", {
  email: "user@example.com",
  password: "password123",
  product_id: "prod_xxx",
});
```

## UserClient

```ts
import { UserClient } from "@downcity/conduit";
import type { UIMessageChunk } from "ai";

const client = new UserClient({
  base_url: "http://127.0.0.1:3001",
  product_id: "prod_xxx",
  user_token: "ub_xxx",
});

const models = await client.models();

const message = await client.text({
  model: models.primary(),
  prompt: "你好",
});

const stream = await client.stream({
  model: models.primary(),
  prompt: "流式输出一段文案",
});

const reader = stream.getReader();
const firstChunk: UIMessageChunk | undefined = (await reader.read()).value;
```

`text()` 固定返回 AI SDK `UIMessage`。`stream()` 固定返回 `ReadableStream<UIMessageChunk>`，适配 InfraRuntime 侧的 `createUIMessageStreamResponse()` 或 `streamText().toUIMessageStreamResponse()`。

`image()` 和 `video()` 也固定返回 AI SDK `UIMessage`，建议用 message 的 file part 表达图片或视频文件。

需要读取支付方式时，优先直接用：

```ts
const methods = await client.payment.methods();

const checkout = await client.payment.method("stripe").invoke({
  topup_id: "topup_demo",
});
```

需要调用用户侧服务路由时，使用 `service(id)`：

```ts
const usage = await client.service("usage").get("me");
```

## AdminClient

```ts
import { AdminClient } from "@downcity/conduit";

const admin = new AdminClient({
  base_url: "http://127.0.0.1:3001",
  admin_secret_key: "admin_xxx",
});

const product = await admin.products.create({
  name: "Demo Product",
});

const token = await admin.tokens.apply({
  product_id: product.product_id,
  user_id: "user_123",
  ttl: "30m",
});
```

需要调用管理侧服务路由时，使用 `service(id)`：

```ts
const events = await admin.service("usage").get("events");
```

## 文档

- 仓库首页：[downcity](https://github.com/wangenius/downcity)
- 文档目录：[homepage/content/docs](https://github.com/wangenius/downcity/tree/main/homepage/content/docs)
