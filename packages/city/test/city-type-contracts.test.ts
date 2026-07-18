/**
 * @downcity/city City 客户端类型契约测试。
 */

import type { UIMessage, UIMessageChunk } from "ai";
import type {
  AIInvoker,
  CityProviderStreamCall,
  CityProviderStreamResult,
  CityModelDescriptor,
  City,
  ModelCatalog,
  PaymentMethodHandle,
  UserImageJobCreateResult,
  UserImageJobResult,
  UserModelRef,
  UserPaymentMethod,
  UserServiceSummary,
} from "../src/index.js";

declare const provider_stream_call: CityProviderStreamCall;
declare const provider_stream_result: CityProviderStreamResult;
void provider_stream_call;
void provider_stream_result;

declare const city: City<"user">;
declare const admin: City<"admin">;
declare const user_city: City<"user">;
declare const admin_city: City<"admin">;

const ai: AIInvoker = city.ai;

const textResult = ai.text({ model: "gpt-5.4", prompt: "hello" });
const textContract: Promise<UIMessage> = textResult;

const reasoningTextResult = ai.text({
  model: "gpt-5.4",
  prompt: "hello",
  reasoning_effort: "high",
});
const reasoningTextContract: Promise<UIMessage> = reasoningTextResult;
void reasoningTextContract;

const streamResult = ai.stream({ model: "gpt-5.4", prompt: "hello" });
const streamContract: Promise<ReadableStream<UIMessageChunk>> = streamResult;

const imageJobCreateResult = ai.image_create({ model: "image-basic", prompt: "draw" });
const imageJobCreateContract: Promise<UserImageJobCreateResult> = imageJobCreateResult;
void imageJobCreateContract;

const imageJobResult = ai.image_result({ job_id: "img_1" });
const imageJobResultContract: Promise<UserImageJobResult> = imageJobResult;
void imageJobResultContract;

const videoResult = ai.video({ model: "video-basic", prompt: "demo" });
const videoContract: Promise<UIMessage> = videoResult;

const adminServices = admin.listServices();
const adminServicesContract: Promise<UserServiceSummary[]> = adminServices;

const adminModels = admin.listModels();
const adminModelsContract: Promise<CityModelDescriptor[]> = adminModels;

const adminInstruction = admin.instruction();
const adminInstructionContract: Promise<string> = adminInstruction;

const paymentMethods = city.payment.methods();
const paymentMethodsContract: Promise<UserPaymentMethod[]> = paymentMethods;

const cityPaymentMethodsContract: Promise<UserPaymentMethod[]> = user_city.payment.methods();
const cityAdminServicesContract: Promise<UserServiceSummary[]> = admin_city.listServices();
const cityInstructionContract: Promise<string> = admin_city.instruction();
void cityPaymentMethodsContract;
void cityAdminServicesContract;
void cityInstructionContract;

const paymentMethod: PaymentMethodHandle = city.payment.method("stripe");
const paymentMethodDescribeContract: Promise<UserPaymentMethod> = paymentMethod.describe();
const paymentMethodInvokeContract: Promise<{ checkout_url: string }> = paymentMethod.invoke<{
  checkout_url: string;
}>({
  topup_id: "topup_demo",
});
void paymentMethodDescribeContract;
void paymentMethodInvokeContract;

async function testCatalog() {
  const catalog: ModelCatalog = await ai.catalog();
  const m = catalog.get("gpt-5.4");
  const all = catalog.all();
  const t = catalog.forModality("text");
  const reasoning_efforts = m?.reasoning?.efforts;
  const default_reasoning_effort = m?.reasoning?.default_effort;
  const context_window = m?.context_window;
  const price = m?.price;
  void m; void all; void t; void reasoning_efforts; void default_reasoning_effort; void context_window; void price;
}
void testCatalog();

// @ts-expect-error text 返回类型固定为 UIMessage
ai.text<{ text: string }>({ prompt: "hello" });

// @ts-expect-error stream 返回类型固定为 UIMessageChunk stream
ai.stream<ReadableStream<string>>({ prompt: "hello" });

// @ts-expect-error image 已移除，图片生成请使用 image_create / image_result
ai.image({ prompt: "draw" });

// @ts-expect-error video 返回类型固定为 UIMessage
ai.video<{ url: string }>({ prompt: "demo" });
