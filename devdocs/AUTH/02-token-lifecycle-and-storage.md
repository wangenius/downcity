# Token 生命周期与存储

## 1. Token 从哪里来

当前 Bearer Token 的来源只有统一账户系统：

1. `POST /api/auth/bootstrap-admin`
2. `POST /api/auth/login`
3. `POST /api/auth/token/create`

对应语义：

1. bootstrap：第一次初始化管理员，同时签发第一枚 token
2. login：管理员登录后签发新 token
3. token create：已登录用户再生成额外 token

## 2. Token 如何存

当前系统区分“服务端存储”和“客户端存储”。

### 2.1 服务端存储

服务端只存 hash，不存明文 token。

位置：

- `packages/downcity/src/main/auth/AuthService.ts`
- `packages/downcity/src/main/auth/TokenService.ts`
- `packages/downcity/src/main/auth/AuthStore.ts`

规则：

1. 明文 token 只在签发时返回一次
2. 数据库里保存的是 hash
3. 校验时先从 `Authorization` 头提取 Bearer Token，再计算 hash 查库

### 2.2 Console UI 存储

Console UI 把明文 token 存在浏览器本地存储里。

位置：

- `products/console-ui/src/lib/dashboard-api.ts`

规则：

1. 登录成功后写入 localStorage
2. 之后所有 dashboard / ui / service / plugin 请求自动带 `Authorization`

### 2.3 CLI 存储

CLI 现在也有自己的本地登录态存储。

位置：

- `packages/downcity/src/main/auth/CliAuthStateStore.ts`

规则：

1. 存在 console 级加密配置表里
2. key 是 `cli:auth:state`
3. 保存字段包括 `token` / `username` / `source` / `updatedAt`

## 3. CLI token 的写入时机

当前已经落地的自动写入时机是：

1. `city start`
2. `city console start`

在首次 bootstrap 管理员时，`ensureConsoleAuthBootstrap()` 会把刚签发的 bootstrap token 写入 CLI 本地认证状态。

位置：

- `packages/downcity/src/main/commands/ConsoleAuthBootstrap.ts`

设计意图很简单：

1. 首次启动后 CLI 立即可用
2. 不要求用户再手动复制 token

## 4. CLI token 的读取优先级

当前统一规则是：

1. `--token`
2. `DC_AUTH_TOKEN`
3. CLI 本地加密存储

位置：

- `packages/downcity/src/main/auth/CliAuthStateStore.ts`

这套顺序的意义是：

1. 命令行显式传参优先级最高
2. CI / agent shell / 临时运行环境可以靠 env 覆盖
3. 普通本地开发默认走已保存登录态

## 4.1 runtime internal token

为了让 agent 自己在 shell 里执行 `city task` / `city chat` 不依赖用户手动登录，agent server 现在还有一条内部 token 链：

1. server 启动时生成 `DC_INTERNAL_AUTH_TOKEN`
2. shell 子进程启动时自动映射成 `DC_AUTH_TOKEN`
3. shell 内部的 `city ...` 命令按现有优先级自动读到它

这条 token：

1. 不写入 `auth_tokens` 表
2. 不暴露给用户界面
3. 只服务当前 agent runtime 的内部自调用

## 5. Token 生命周期

一个 token 的完整生命周期是：

1. 签发
2. 返回明文一次
3. 后续用于请求认证
4. 记录 `lastUsedAt`
5. 需要时吊销

补充：

1. token 可以过期
2. token 可以撤销
3. token 对应的是 user，不是 session

## 6. 当前没有实现的部分

下面这些还不是当前真实实现的一部分：

1. `city auth login` 命令
2. 独立的 runtime token 轮换与过期策略
3. 每个 session 的独立认证主体

这三者里，前两者是可选增强；第三者不是目标模型。
