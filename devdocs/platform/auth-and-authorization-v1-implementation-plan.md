# Downcity 认证与授权 V1 实施稿

这份文档承接《统一账户系统架构设计稿》，目标是把抽象设计收敛成第一阶段可以直接实施的内容。

V1 只做一件事：

```text
建立统一账户系统，所有受保护接口统一改为 Bearer Token 鉴权。
```

本文回答 4 个问题：

1. V1 需要哪些数据表和类型
2. V1 需要哪些 API
3. V1 需要新增和修改哪些模块
4. V1 应该按什么顺序落地

---

## 1. V1 范围

V1 包含：

1. 管理员账户 bootstrap
2. 用户登录
3. Bearer Token 签发与校验
4. 统一鉴权中间件
5. 路由权限矩阵
6. 审计日志基础版

V1 暂不包含：

1. 刷新 token
2. OAuth
3. 多租户
4. 用户自助注册
5. 邮箱验证
6. 客户端公钥 / 私钥

---

## 2. 数据表草案

### 2.1 `auth_users`

用途：

1. 存储系统用户

建议字段：

1. `id`
2. `username`
3. `password_hash`
4. `display_name`
5. `status`
6. `created_at`
7. `updated_at`

字段建议：

1. `status` 取值：
   - `active`
   - `disabled`

### 2.2 `auth_roles`

用途：

1. 定义角色

建议字段：

1. `id`
2. `name`
3. `description`
4. `created_at`
5. `updated_at`

V1 默认角色：

1. `admin`
2. `operator`
3. `viewer`

### 2.3 `auth_permissions`

用途：

1. 定义权限点

建议字段：

1. `id`
2. `key`
3. `description`
4. `created_at`
5. `updated_at`

第一批权限建议：

1. `agent.read`
2. `agent.write`
3. `agent.execute`
4. `service.read`
5. `service.write`
6. `task.read`
7. `task.run`
8. `model.read`
9. `model.write`
10. `env.read`
11. `env.write`
12. `channel.read`
13. `channel.write`
14. `auth.read`
15. `auth.write`
16. `shell.execute`
17. `session.read`
18. `session.write`

### 2.4 `auth_user_roles`

用途：

1. 绑定用户与角色

建议字段：

1. `id`
2. `user_id`
3. `role_id`
4. `created_at`

### 2.5 `auth_role_permissions`

用途：

1. 绑定角色与权限

建议字段：

1. `id`
2. `role_id`
3. `permission_id`
4. `created_at`

### 2.6 `auth_tokens`

用途：

1. 存储访问 token 的 hash 与元数据

建议字段：

1. `id`
2. `user_id`
3. `name`
4. `token_hash`
5. `expires_at`
6. `revoked_at`
7. `last_used_at`
8. `created_at`
9. `updated_at`

关键规则：

1. 服务端不存明文 token
2. 明文 token 只在创建或登录成功时返回一次

### 2.7 `auth_audit_logs`

用途：

1. 记录关键安全动作

建议字段：

1. `id`
2. `actor_user_id`
3. `actor_token_id`
4. `resource_type`
5. `resource_id`
6. `action`
7. `result`
8. `request_id`
9. `ip`
10. `user_agent`
11. `meta_json`
12. `created_at`

---

## 3. 类型草案

建议把类型集中到：

- `/Users/wangenius/Documents/github/downcity/packages/downcity/src/types/auth`

建议新增类型：

1. `AuthUser`
2. `AuthRole`
3. `AuthPermission`
4. `AuthTokenRecord`
5. `AuthAuditLog`
6. `AuthPrincipal`
7. `AuthDecision`
8. `AuthRoutePolicy`

建议拆分文件：

1. [AuthTypes.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/types/auth/AuthTypes.ts)
2. [AuthToken.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/types/auth/AuthToken.ts)
3. [AuthPermission.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/types/auth/AuthPermission.ts)
4. [AuthRoute.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/types/auth/AuthRoute.ts)

---

## 4. API 清单

### 4.1 Public API

这些接口允许匿名访问：

1. `POST /api/auth/login`
2. `GET /health`
3. 必要静态资源

### 4.2 Auth API

建议新增：

1. `POST /api/auth/login`
2. `POST /api/auth/bootstrap-admin`
3. `GET /api/auth/me`
4. `POST /api/auth/token/create`
5. `GET /api/auth/token/list`
6. `POST /api/auth/token/revoke`

#### `POST /api/auth/login`

请求：

1. `username`
2. `password`

响应：

1. `success`
2. `token`
3. `user`
4. `expiresAt`

#### `POST /api/auth/bootstrap-admin`

用途：

1. 初始化首个管理员

建议限制：

1. 仅在系统尚无用户时允许执行

#### `GET /api/auth/me`

用途：

1. 返回当前 token 对应的用户与权限摘要

#### `POST /api/auth/token/create`

用途：

1. 为当前用户创建新的访问 token

#### `GET /api/auth/token/list`

用途：

1. 查看当前用户已有 token 的摘要信息

#### `POST /api/auth/token/revoke`

用途：

1. 吊销当前用户的某个 token

### 4.3 受保护现有 API

以下接口全部改为必须带 Bearer Token：

1. `/api/execute`
2. `/api/services/*`
3. `/api/plugins/*`
4. `/api/dashboard/*`
5. `/api/ui/*`

---

## 5. 路由权限矩阵

### 5.1 `admin`

拥有全部权限。

### 5.2 `operator`

建议默认允许：

1. `agent.read`
2. `agent.execute`
3. `service.read`
4. `task.read`
5. `task.run`
6. `session.read`
7. `session.write`

默认不允许：

1. `env.write`
2. `model.write`
3. `channel.write`
4. `auth.write`
5. `shell.execute`

### 5.3 `viewer`

建议默认只允许：

1. `agent.read`
2. `service.read`
3. `task.read`
4. `session.read`

---

## 6. 模块落地清单

### 6.1 新增目录

1. `/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/auth`
2. `/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/auth/routes`
3. `/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/auth/runtime`
4. `/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/auth/token`
5. `/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/auth/policy`
6. `/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/auth/store`
7. `/Users/wangenius/Documents/github/downcity/packages/downcity/src/types/auth`

### 6.2 新增模块

1. [AuthConfig.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/auth/AuthConfig.ts)
   - 认证配置入口
2. [AuthBootstrap.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/auth/AuthBootstrap.ts)
   - 初始化管理员账户
3. [AuthService.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/auth/AuthService.ts)
   - 登录、读取当前用户、权限摘要
4. [AuthMiddleware.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/auth/AuthMiddleware.ts)
   - Bearer Token 校验中间件
5. [BearerTokenAuth.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/auth/runtime/BearerTokenAuth.ts)
   - token 提取、hash、匹配
6. [TokenService.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/auth/token/TokenService.ts)
   - token 创建、列出、吊销
7. [PermissionPolicy.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/auth/policy/PermissionPolicy.ts)
   - 角色与 scope 判断
8. [RoutePolicy.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/auth/policy/RoutePolicy.ts)
   - 路由到权限的映射
9. [AuthStore.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/auth/store/AuthStore.ts)
   - 认证域 DB 读写
10. [AuthSchema.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/auth/store/AuthSchema.ts)
   - 表结构与迁移入口
11. [AuditLogService.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/auth/AuditLogService.ts)
   - 审计日志
12. [AuthRoutes.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/auth/routes/AuthRoutes.ts)
   - 登录与 me
13. [TokenRoutes.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/auth/routes/TokenRoutes.ts)
   - token 管理

---

## 7. 首批修改文件

### 7.1 服务端入口

1. [packages/downcity/src/main/index.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/index.ts)
2. [packages/downcity/src/main/routes/execute.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/routes/execute.ts)
3. [packages/downcity/src/main/routes/services.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/routes/services.ts)
4. [packages/downcity/src/main/routes/plugins.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/routes/plugins.ts)
5. [packages/downcity/src/main/service/ServiceActionApi.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/service/ServiceActionApi.ts)

### 7.2 Console UI 网关

1. [packages/downcity/src/main/ui/ConsoleUIGateway.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/ui/ConsoleUIGateway.ts)
2. [packages/downcity/src/main/ui/ConsoleUIGatewayRoutes.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/ui/ConsoleUIGatewayRoutes.ts)
3. [packages/downcity/src/main/ui/gateway/Proxy.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/ui/gateway/Proxy.ts)
4. [packages/downcity/src/main/ui/EnvApiRoutes.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/ui/EnvApiRoutes.ts)
5. [packages/downcity/src/main/ui/ModelApiRoutes.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/ui/ModelApiRoutes.ts)
6. [packages/downcity/src/main/ui/ChannelAccountApiRoutes.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/ui/ChannelAccountApiRoutes.ts)
7. [packages/downcity/src/main/ui/DashboardAuthorizationRoutes.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/ui/DashboardAuthorizationRoutes.ts)
8. [packages/downcity/src/main/ui/dashboard/SessionRoutes.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/ui/dashboard/SessionRoutes.ts)
9. [packages/downcity/src/main/ui/dashboard/TaskRoutes.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/ui/dashboard/TaskRoutes.ts)
10. [packages/downcity/src/main/ui/gateway/AgentActions.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/ui/gateway/AgentActions.ts)

### 7.3 客户端调用侧

1. [products/console/src/lib/dashboard-api.ts](/Users/wangenius/Documents/github/downcity/products/console/src/lib/dashboard-api.ts)
2. [products/chrome-extension/src/services/http.ts](/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/services/http.ts)
3. [products/chrome-extension/src/services/storage.ts](/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/services/storage.ts)
4. [products/chrome-extension/src/types/extension.ts](/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/types/extension.ts)
5. [products/chrome-extension/src/options/App.tsx](/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/options/App.tsx)

### 7.4 CLI

1. [packages/downcity/src/main/commands/IndexAgentCommand.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/commands/IndexAgentCommand.ts)
2. [packages/downcity/src/main/commands/Run.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/commands/Run.ts)
3. [packages/downcity/src/main/commands/UI.ts](/Users/wangenius/Documents/github/downcity/packages/downcity/src/main/commands/UI.ts)

---

## 8. 实施顺序

### Step 1

先建认证域基础能力：

1. `AuthSchema`
2. `AuthStore`
3. `TokenService`
4. `AuthService`

### Step 2

再建入口能力：

1. `bootstrap-admin`
2. `login`
3. `me`
4. `token create/list/revoke`

### Step 3

再接统一中间件：

1. `AuthMiddleware`
2. `RoutePolicy`
3. `PermissionPolicy`

### Step 4

再收口现有 API：

1. runtime routes
2. dashboard routes
3. console-ui routes

### Step 5

最后接前端与扩展：

1. Console UI 带 token
2. Extension 带 token
3. CLI 支持登录和 token 管理

---

## 9. 第一批建议测试

至少补这些测试：

1. 未登录访问受保护接口返回 `401`
2. token 无效返回 `401`
3. token 已吊销返回 `401`
4. 权限不足返回 `403`
5. bootstrap-admin 只能在无用户时执行
6. token 创建后只返回一次明文
7. `/api/ui/*` 与 `/api/dashboard/*` 都受中间件保护

---

## 10. V1 完成判定

满足以下条件即可认为 V1 完成：

1. 系统可以 bootstrap 首个管理员
2. 用户可以登录并拿到 Bearer Token
3. 所有受保护 API 都统一校验 token
4. 高危操作能按角色/权限拒绝
5. Console UI、CLI、Chrome Extension 都能带 token 访问
6. 关键操作有审计日志
