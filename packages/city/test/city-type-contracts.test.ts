/**
 * @downcity/city City 客户端类型契约测试。
 */

import type { UIMessage, UIMessageChunk } from "ai";
import type {
  AIInvoker,
  CityModelDescriptor,
  City,
  ModelCatalog,
  ModelHandle,
  PaymentMethodHandle,
  UserModelRef,
  UserPaymentMethod,
  UserServiceSummary,
} from "../src/index.js";

declare const client: City<"user">;
declare const admin: City<"admin">;
declare const user_city: City<"user">;
declare const admin_city: City<"admin">;

const ai: AIInvoker = client.ai;

const textResult = ai.text({ prompt: "hello" });
const textContract: Promise<UIMessage> = textResult;

const streamResult = ai.stream({ prompt: "hello" });
const streamContract: Promise<ReadableStream<UIMessageChunk>> = streamResult;

const imageResult = ai.image({ prompt: "draw" });
const imageContract: Promise<UIMessage> = imageResult;
void imageContract;

const videoResult = ai.video({ prompt: "demo" });
const videoContract: Promise<UIMessage> = videoResult;

const adminServices = admin.listServices();
const adminServicesContract: Promise<UserServiceSummary[]> = adminServices;

const adminModels = admin.listModels();
const adminModelsContract: Promise<CityModelDescriptor[]> = adminModels;

const adminInstruction = admin.instruction();
const adminInstructionContract: Promise<string> = adminInstruction;

const paymentMethods = client.payment.methods();
const paymentMethodsContract: Promise<UserPaymentMethod[]> = paymentMethods;

const cityPaymentMethodsContract: Promise<UserPaymentMethod[]> = user_city.payment.methods();
const cityAdminServicesContract: Promise<UserServiceSummary[]> = admin_city.listServices();
const cityInstructionContract: Promise<string> = admin_city.instruction();
void cityPaymentMethodsContract;
void cityAdminServicesContract;
void cityInstructionContract;

const paymentMethod: PaymentMethodHandle = client.payment.method("stripe");
const paymentMethodDescribeContract: Promise<UserPaymentMethod> = paymentMethod.describe();
const paymentMethodInvokeContract: Promise<{ checkout_url: string }> = paymentMethod.invoke<{
  checkout_url: string;
}>({
  topup_id: "topup_demo",
});
void paymentMethodDescribeContract;
void paymentMethodInvokeContract;

async function testCatalog() {
  const catalog: ModelCatalog = await ai.listModels();
  const m = catalog.get("gpt-5.4");
  const d = catalog.default();
  const all = catalog.all();
  const t = catalog.forModality("text");
  void m; void d; void all; void t;
}
void testCatalog();

declare const handle: ModelHandle;

// @ts-expect-error create 已移除，需由用户自己创建第三方 SDK client
handle.create();

// @ts-expect-error text 返回类型固定为 UIMessage
ai.text<{ text: string }>({ prompt: "hello" });

// @ts-expect-error stream 返回类型固定为 UIMessageChunk stream
ai.stream<ReadableStream<string>>({ prompt: "hello" });

// @ts-expect-error image 返回类型固定为 UIMessage
ai.image<{ url: string }>({ prompt: "draw" });

// @ts-expect-error video 返回类型固定为 UIMessage
ai.video<{ url: string }>({ prompt: "demo" });
