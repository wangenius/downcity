#!/usr/bin/env node
/**
 * 模型连通性测试脚本（开发测试用途）。
 *
 * 目标（中文）
 * - 放在 `package/test`，避免污染运行时代码。
 * - 直接读取项目的 `ship.json + .env`，验证模型 API 是否可用。
 * - 输出统一使用 `[key]: value` 风格，便于快速排查。
 */

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_MAX_OUTPUT_TOKENS = 32;
const DEFAULT_PROMPT = "请仅回复 OK";

function printHelp() {
  console.log("Usage:");
  console.log(
    "  node package/test/test-model.mjs [projectPath] [--attempts <n>] [--prompt <text>] [--max-output-tokens <n>] [--verbose]",
  );
}

function parsePositiveInteger(value, label, fallback, min, max) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer`);
  }
  if (parsed < min || parsed > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }
  return parsed;
}

function toInlineText(text, maxChars) {
  const singleLine = String(text || "").replace(/\r?\n/g, "\\n").trim();
  if (singleLine.length <= maxChars) return singleLine;
  return `${singleLine.slice(0, maxChars)}…(truncated, ${singleLine.length} chars total)`;
}

function toErrorMessage(error) {
  if (error instanceof Error) {
    const cause = error.cause;
    if (cause instanceof Error && cause.message) {
      return `${error.message}; cause=${cause.message}`;
    }
    if (cause !== undefined && cause !== null) {
      return `${error.message}; cause=${String(cause)}`;
    }
    return error.message;
  }
  return String(error);
}

function parseArgs(argv) {
  const args = [...argv];
  let projectPath = ".";
  if (args.length > 0 && !args[0].startsWith("-")) {
    projectPath = args.shift() || ".";
  }

  const options = {
    attempts: DEFAULT_ATTEMPTS,
    prompt: DEFAULT_PROMPT,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    verbose: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--help" || flag === "-h") {
      printHelp();
      process.exit(0);
    }
    if (flag === "--verbose") {
      options.verbose = true;
      continue;
    }
    if (flag === "--attempts" || flag === "-n") {
      options.attempts = parsePositiveInteger(
        args[index + 1],
        "attempts",
        DEFAULT_ATTEMPTS,
        1,
        20,
      );
      index += 1;
      continue;
    }
    if (flag === "--max-output-tokens") {
      options.maxOutputTokens = parsePositiveInteger(
        args[index + 1],
        "maxOutputTokens",
        DEFAULT_MAX_OUTPUT_TOKENS,
        1,
        8192,
      );
      index += 1;
      continue;
    }
    if (flag === "--prompt") {
      const next = String(args[index + 1] || "").trim();
      if (!next) throw new Error("prompt cannot be empty");
      options.prompt = next;
      index += 1;
      continue;
    }
    throw new Error(`unknown flag: ${flag}`);
  }

  return { projectPath, options };
}

function resolveEnvPlaceholdersDeep(value) {
  if (typeof value === "string") {
    const matched = value.match(/^\$\{([A-Z0-9_]+)\}$/);
    if (!matched) return value;
    return process.env[matched[1]];
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveEnvPlaceholdersDeep(item));
  }
  if (value && typeof value === "object") {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = resolveEnvPlaceholdersDeep(item);
    }
    return output;
  }
  return value;
}

function normalizeBaseUrl(baseUrl) {
  const normalized = String(baseUrl || "").trim();
  if (!normalized) return "https://api.openai.com/v1";
  return normalized.replace(/\/+$/, "");
}

function extractOpenAIChatText(payload) {
  if (!Array.isArray(payload?.choices)) return "";
  const lines = [];
  for (const choice of payload.choices) {
    if (!choice || typeof choice !== "object") continue;
    const content = choice?.message?.content;
    if (typeof content === "string" && content.trim()) {
      lines.push(content.trim());
    }
  }
  return lines.join("\n");
}

function extractAnthropicText(payload) {
  if (!Array.isArray(payload?.content)) return "";
  const lines = [];
  for (const item of payload.content) {
    if (!item || typeof item !== "object") continue;
    if (item.type !== "text") continue;
    if (typeof item.text === "string" && item.text.trim()) {
      lines.push(item.text.trim());
    }
  }
  return lines.join("\n");
}

async function requestOpenAIChatCompletions(params) {
  const endpoint = `${normalizeBaseUrl(params.baseUrl)}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      messages: [
        { role: "user", content: params.prompt },
      ],
      max_tokens: params.maxOutputTokens,
      stream: false,
    }),
  });

  const rawText = await response.text();
  let payload = null;
  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(
      [
        `http_status=${response.status}`,
        `cfRay=${response.headers.get("cf-ray") || "-"}`,
        `message=${toInlineText(rawText || response.statusText, 240)}`,
      ].join(" "),
    );
  }

  return {
    text: extractOpenAIChatText(payload),
  };
}

async function requestAnthropic(params) {
  const baseUrlRaw = String(params.baseUrl || "").trim();
  const baseUrl = baseUrlRaw ? baseUrlRaw.replace(/\/+$/, "") : "https://api.anthropic.com/v1";
  const endpoint = `${baseUrl}/messages`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.maxOutputTokens,
      messages: [{ role: "user", content: params.prompt }],
    }),
  });

  const rawText = await response.text();
  let payload = null;
  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(
      [
        `http_status=${response.status}`,
        `cfRay=${response.headers.get("cf-ray") || "-"}`,
        `message=${toInlineText(rawText || response.statusText, 240)}`,
      ].join(" "),
    );
  }

  return {
    text: extractAnthropicText(payload),
  };
}

async function run() {
  const { projectPath, options } = parseArgs(process.argv.slice(2));
  const projectRoot = path.resolve(projectPath);
  const shipJsonPath = path.join(projectRoot, "ship.json");
  const envPath = path.join(projectRoot, ".env");

  if (!fs.existsSync(shipJsonPath)) {
    console.error(`[error]: ship.json not found at ${shipJsonPath}`);
    process.exit(1);
  }

  dotenv.config({ path: envPath });

  const rawConfig = JSON.parse(fs.readFileSync(shipJsonPath, "utf-8"));
  const config = resolveEnvPlaceholdersDeep(rawConfig);
  const llm = config?.llm || {};
  const provider = String(llm.provider || "").trim();
  const model = String(llm.model || "").trim();
  const apiKey = String(llm.apiKey || "").trim();
  const baseUrl = String(llm.baseUrl || "").trim();

  if (!provider || !model || !apiKey) {
    console.error("[error]: missing llm.provider / llm.model / llm.apiKey in resolved config");
    process.exit(1);
  }

  console.log(`[test-model]: project=${projectRoot}`);
  console.log(`[model]: provider=${provider} name=${model} baseUrl=${baseUrl || "-"}`);
  console.log(
    `[settings]: attempts=${options.attempts} maxOutputTokens=${options.maxOutputTokens}`,
  );

  let lastError = "";
  for (let index = 0; index < options.attempts; index += 1) {
    const attempt = index + 1;
    console.log(`[attempt:${attempt}/${options.attempts}]: start`);
    const startedAt = Date.now();
    try {
      const result =
        provider === "anthropic"
          ? await requestAnthropic({
              baseUrl,
              apiKey,
              model,
              prompt: options.prompt,
              maxOutputTokens: options.maxOutputTokens,
            })
          : await requestOpenAIChatCompletions({
              baseUrl,
              apiKey,
              model,
              prompt: options.prompt,
              maxOutputTokens: options.maxOutputTokens,
            });

      const latencyMs = Date.now() - startedAt;
      const output = String(result.text || "").trim();
      console.log(
        `[attempt:${attempt}/${options.attempts}]: success latency=${latencyMs}ms chars=${output.length}`,
      );
      if (options.verbose) {
        console.log(`[assistant]: ${toInlineText(output, 1000)}`);
      }
      console.log("[result]: PASS");
      return;
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      lastError = toErrorMessage(error);
      console.error(
        `[attempt:${attempt}/${options.attempts}]: failed latency=${latencyMs}ms message=${toInlineText(lastError, 280)}`,
      );
    }
  }

  console.error(`[result]: FAIL message=${toInlineText(lastError, 320)}`);
  process.exit(1);
}

run().catch((error) => {
  const message = toErrorMessage(error);
  console.error(`[error]: ${toInlineText(message, 320)}`);
  process.exit(1);
});
