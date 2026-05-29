# @downcity/gate

`@downcity/gate` 是 Downcity 的客户端 SDK。

它提供两类客户端：

- `UserClient`：给终端用户侧访问 City，也负责公开服务入口，例如登录、注册、webhook
- `AdminClient`：给可信后端管理 studio、签发 `user_token`、维护 City env

## 安装

```bash
pnpm add @downcity/gate
```

## UserClient 调公开服务

```ts
import { UserClient } from "@downcity/gate";

const guest = new UserClient({
  base_url: "http://127.0.0.1:3001",
});

const session = await guest.service("accounts").post("login", {
  email: "user@example.com",
  password: "password123",
  studio_id: "studio_xxx",
});
```

## UserClient

```ts
import { UserClient } from "@downcity/gate";
import type { UIMessageChunk } from "ai";

const client = new UserClient({
  base_url: "http://127.0.0.1:3001",
  studio_id: "studio_xxx",
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

`text()` 固定返回 AI SDK `UIMessage`。`stream()` 固定返回 `ReadableStream<UIMessageChunk>`，适配 City 侧的 `createUIMessageStreamResponse()` 或 `streamText().toUIMessageStreamResponse()`。

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
import { AdminClient } from "@downcity/gate";

const admin = new AdminClient({
  base_url: "http://127.0.0.1:3001",
  admin_secret_key: "admin_xxx",
});

const studio = await admin.studios.create({
  name: "Demo Studio",
});

const token = await admin.tokens.apply({
  studio_id: studio.studio_id,
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
