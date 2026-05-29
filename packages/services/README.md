# @downcity/services

Downcity 官方服务聚合包。

这个包统一提供账号、余额、usage 与 Stripe 支付四类官方服务，避免业务侧分别安装多个 `service-*` 包。

## 安装

```bash
pnpm add @downcity/services
```

## 使用

```ts
import {
  accountsService,
  balanceService,
  paymentService,
  stripePaymentMethod,
  stripePaymentService,
  usageService,
  type StripePaymentServiceBalanceBridge,
} from "@downcity/services";
```

产品侧通常先这样读取支付方式：

```ts
const methods = await guest.service("payment").get("methods");
```

再根据返回结果调用具体支付方式，例如：

```ts
const checkout = await user.service("payment.stripe").action("checkout/create").invoke({
  topup_id: "topup_demo",
});
```

## 包含的服务

- `accountsService()`：注册、登录、邮箱验证、GitHub/Google OAuth 与 `user_token` 签发
- `balanceService()`：全局余额账户、流水、充值单与兑换码
- `paymentService()`：统一暴露当前 City 可用的支付方式列表
- `usageService()`：记录真实用户侧 service 调用事件
- `stripePaymentService()`：把 Stripe 一次性支付同步成 balance topup 到账
