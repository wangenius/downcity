# @downcity/services

Downcity 官方服务聚合包。

这个包统一提供账号、余额、usage、统一 Payment 与多支付 provider 等官方服务，避免业务侧分别安装多个 `service-*` 包。

## 安装

```bash
pnpm add @downcity/services
```

## 使用

```ts
import {
  AccountsService,
  BalanceService,
  PaymentService,
  UsageService,
  creemPaymentProvider,
  dodoPaymentProvider,
  emailAccountsProvider,
  githubAccountsProvider,
  googleAccountsProvider,
  stripePaymentProvider,
  wechatAccountsProvider,
  waffoPaymentProvider,
} from "@downcity/services";
```

产品侧通常先这样读取支付方式：

```ts
const methods = await guest.service("payment").get("methods");
```

再根据返回结果调用具体支付方式，例如：

```ts
const checkout = await user.service("payment").action("checkout/create").invoke({
  method_id: "stripe",
  topup_id: "topup_demo",
});
```

Creem 支付方式使用同样的调用形态：

```ts
const checkout = await user.service("payment").action("checkout/create").invoke({
  method_id: "creem",
  topup_id: "topup_demo",
});
```

## 包含的服务

- `AccountsService`：统一账号服务容器，负责账号表、better-auth、profile、OAuth callback 和 `user_token` 签发
- `emailAccountsProvider()` / `githubAccountsProvider()` / `googleAccountsProvider()` / `wechatAccountsProvider()`：作为 provider 挂到统一 `AccountsService`
- `BalanceService`：全局余额账户、流水、充值单与兑换码
- `PaymentService`：统一暴露支付方式、checkout、webhook、payments 与入账同步
- `UsageService`：记录真实用户侧 service 调用事件
- `stripePaymentProvider()` / `creemPaymentProvider()` / `dodoPaymentProvider()` / `waffoPaymentProvider()`：作为 provider 挂到统一 `PaymentService`

`AccountsService` 启用只代表账号服务、表和 better-auth runtime 已安装；具体登录方式由 provider 决定。`/v1/accounts/providers` 只返回 required env 或 runtime 配置已经满足的 provider。产品侧统一使用 `accounts.login/start`、`accounts.login/continue`、`accounts.login/result`：OAuth 返回授权 URL，input provider 先提交输入，最终都从 `login/result` 读取 `user_token`。
