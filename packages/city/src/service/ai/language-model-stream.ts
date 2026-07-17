/**
 * Federation City LanguageModel Transport 流模块。
 *
 * 负责请求协议校验、LanguageModelV3 调用和 SSE 编码。模型路由、reasoning、
 * 计费与鉴权仍由 AIService 负责。
 */

import {
  CITY_LANGUAGE_MODEL_PROTOCOL_V1,
  type CityLanguageModelStreamEventV1,
  type CityTransportJsonObject,
  type CityTransportJsonValue,
} from "../../types/CityLanguageModelTransport.js";
import type {
  CityLanguageModelStreamExecution,
  CityRuntimeCallOptions,
  CityRuntimeStreamPart,
  CreateCityLanguageModelStreamInput,
  DecodedCityLanguageModelRequest,
  RawCityLanguageModelRequest,
} from "../../types/CityLanguageModelRuntime.js";
import {
  decode_city_transport_value,
  encode_city_transport_object,
} from "../../utils/CityLanguageModelCodec.js";

const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
} as const;

/** 校验并解码 CityModel transport 请求。 */
export function decode_city_language_model_request(
  input: RawCityLanguageModelRequest,
): DecodedCityLanguageModelRequest {
  if (input.protocol !== CITY_LANGUAGE_MODEL_PROTOCOL_V1) {
    throw create_protocol_error(`Unsupported City language model protocol: ${String(input.protocol)}`);
  }
  const model_id = read_required_string(input.model_id, "model_id");
  if (!is_json_object(input.call)) throw create_protocol_error("call must be a JSON object");
  const decoded = decode_city_transport_value(input.call as CityTransportJsonValue);
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw create_protocol_error("decoded call must be an object");
  }
  const call = decoded as CityRuntimeCallOptions;
  if (!Array.isArray(call.prompt)) throw create_protocol_error("call.prompt must be an array");
  if (call.tools?.some((tool) => tool.type === "provider")) {
    throw create_protocol_error("Provider-defined tools are not supported by City transport v1");
  }
  return {
    model_id,
    call,
    ...(read_optional_string(input.reasoning_effort)
      ? { reasoning_effort: read_optional_string(input.reasoning_effort) }
      : {}),
  };
}

/** 调用 Provider LanguageModelV3 并编码为 City transport SSE。 */
export async function create_city_language_model_stream(
  input: CreateCityLanguageModelStreamInput,
): Promise<CityLanguageModelStreamExecution> {
  const {
    abortSignal: _abort_signal,
    headers: _headers,
    includeRawChunks: _include_raw_chunks,
    providerOptions: _provider_options,
    ...safe_call
  } = input.call;
  const call: CityRuntimeCallOptions = {
    ...safe_call,
    abortSignal: input.signal,
    providerOptions: input.provider_options,
  };
  const result = await input.model.doStream(call);
  const reader = result.stream.getReader();
  const encoder = new TextEncoder();
  let resolve_completion: (part: CityRuntimeStreamPart | undefined) => void = () => undefined;
  const completion = new Promise<CityRuntimeStreamPart | undefined>((resolve) => {
    resolve_completion = resolve;
  });
  let completed = false;

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          complete(undefined);
          controller.close();
          return;
        }
        if (is_finish_part(chunk.value)) complete(chunk.value);
        controller.enqueue(encoder.encode(serialize_stream_part(chunk.value)));
      } catch (error) {
        controller.enqueue(encoder.encode(serialize_stream_part({ type: "error", error } as CityRuntimeStreamPart)));
        complete(undefined);
        controller.close();
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        complete(undefined);
      }
    },
  });

  return {
    response: new Response(body, { status: 200, headers: SSE_HEADERS }),
    completion,
  };

  /** 只完成一次 completion promise。 */
  function complete(part: CityRuntimeStreamPart | undefined): void {
    if (completed) return;
    completed = true;
    resolve_completion(part);
  }
}

/** 把标准 LanguageModelV3 事件编码成一个 SSE event。 */
function serialize_stream_part(part: CityRuntimeStreamPart): string {
  const event: CityLanguageModelStreamEventV1 = {
    protocol: CITY_LANGUAGE_MODEL_PROTOCOL_V1,
    part: encode_city_transport_object(part),
  };
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** 判断流事件是否为包含可信 usage 的 finish。 */
function is_finish_part(part: CityRuntimeStreamPart): boolean {
  return (part as { type?: unknown }).type === "finish";
}

/** 判断输入是否为 transport JSON 对象。 */
function is_json_object(value: unknown): value is CityTransportJsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/** 读取必填非空字符串。 */
function read_required_string(value: unknown, field: string): string {
  const output = read_optional_string(value);
  if (!output) throw create_protocol_error(`${field} is required`);
  return output;
}

/** 读取可选非空字符串。 */
function read_optional_string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** 创建会被 Federation 映射为 422 的协议错误。 */
function create_protocol_error(message: string): Error {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = 422;
  return error;
}
