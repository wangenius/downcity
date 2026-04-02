# 代码地图

## 1. 统一账户核心模块

### 1.1 服务端认证域

- `packages/downcity/src/main/auth/AuthService.ts`
- `packages/downcity/src/main/auth/AuthStore.ts`
- `packages/downcity/src/main/auth/AuthRoutes.ts`
- `packages/downcity/src/main/auth/AuthMiddleware.ts`
- `packages/downcity/src/main/auth/RoutePolicy.ts`
- `packages/downcity/src/main/auth/TokenService.ts`
- `packages/downcity/src/main/auth/PasswordHasher.ts`

职责：

1. 用户登录
2. token 签发与校验
3. principal 解析
4. 路由保护
5. 权限校验

### 1.2 统一账户类型

- `packages/downcity/src/types/auth/AuthTypes.ts`
- `packages/downcity/src/types/auth/AuthToken.ts`
- `packages/downcity/src/types/auth/AuthPermission.ts`
- `packages/downcity/src/types/auth/AuthRoute.ts`
- `packages/downcity/src/types/auth/CliAuthState.ts`

职责：

1. 用户 / 角色 / 权限 / token 结构
2. CLI 本地认证状态结构

## 2. CLI token 自动复用链

### 2.1 CLI 本地认证状态

- `packages/downcity/src/main/auth/CliAuthStateStore.ts`

职责：

1. 写本地 CLI token
2. 读本地 CLI token
3. 解析 `--token > DC_AUTH_TOKEN > 本地存储`

### 2.2 bootstrap 时写入 CLI token

- `packages/downcity/src/main/commands/ConsoleAuthBootstrap.ts`

职责：

1. 首次初始化管理员
2. 把 bootstrap token best-effort 写入 CLI 本地认证状态

### 2.3 所有 CLI 请求统一注入 Authorization

- `packages/downcity/src/main/daemon/Client.ts`
- `packages/downcity/src/main/daemon/Api.ts`

职责：

1. 统一解析 agent API endpoint
2. 统一解析当前应使用的 auth token
3. 给 HTTP 请求加 `Authorization`

## 3. 具体命令入口

### 3.1 service 命令

- `packages/downcity/src/main/commands/ServiceCommandRemote.ts`
- `packages/downcity/src/main/commands/ServiceCommandSupport.ts`
- `packages/downcity/src/main/service/ServiceCommand.ts`

职责：

1. `city service ...`
2. `city task ...`
3. `city chat ...`
4. 其他 service action CLI

### 3.2 plugin 命令

- `packages/downcity/src/main/commands/Plugins.ts`
- `packages/downcity/src/main/plugin/PluginCommand.ts`

职责：

1. `city plugin ...`
2. `city skill ...`
3. `city asr ...`
4. `city tts ...`

## 4. Console UI 登录态

- `console-ui/src/lib/dashboard-api.ts`

职责：

1. 保存浏览器本地 token
2. 统一给 UI 请求附加 `Authorization`

## 5. 测试覆盖

最近与 CLI token 自动复用相关的测试在：

- `packages/downcity/test/main/cli-auth-state.test.mjs`
- `packages/downcity/test/main/console-auth-bootstrap.test.mjs`
- `packages/downcity/test/main/auth-route-policy.test.mjs`

覆盖点：

1. bootstrap token 落本地
2. token 优先级解析
3. `callServer()` 自动注入 Bearer Token
4. bootstrap 前后路由保护切换

## 6. 当前边界

下面这些能力目前还不在真实代码里：

1. `city auth login`
2. `city auth logout`
3. shell runtime 自动下发短期 auth token

如果未来继续做，建议顺序是：

1. 先补 `city auth login/logout`
2. 再考虑 runtime shell 的短期 token
3. 不要引入“每个 session 一个长期 auth token”的模型
