/**
 * TTS Plugin 测试（node:test）。
 *
 * 关键点（中文）
 * - TTS 通过独立插件 action 生成音频文件，不接入 chat 主链路。
 * - 生成结果应直接落地为本地文件，并返回 `<file type="audio">` 可发送标记。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import http from "node:http";
import { ttsPlugin } from "../../bin/plugins/tts/Plugin.js";
import { ConsoleStore } from "../../bin/utils/store/index.js";

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {},
    log() {},
  };
}

async function createSpeechServer() {
  let lastRequestBody = null;
  const audioBuffer = Buffer.from("fake-mp3-data");
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/audio/speech") {
      res.statusCode = 404;
      res.end("not found");
      return;
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    lastRequestBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    res.statusCode = 200;
    res.setHeader("content-type", "audio/mpeg");
    res.end(audioBuffer);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port =
    address && typeof address === "object" && typeof address.port === "number"
      ? address.port
      : 0;

  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    audioBuffer,
    getLastRequestBody() {
      return lastRequestBody;
    },
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

async function createRuntime() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-tts-plugin-"));
  const consoleHome = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-tts-home-"));
  fs.writeFileSync(
    path.join(rootPath, "downcity.json"),
    `${JSON.stringify({
      name: "demo",
      version: "1.0.0",
      model: {
        primary: "demo-model",
      },
    }, null, 2)}\n`,
    "utf-8",
  );

  const dbPath = path.join(consoleHome, ".downcity", "downcity.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const store = new ConsoleStore(dbPath);
  await store.upsertProvider({
    id: "speech-provider",
    type: "open-compatible",
    baseUrl: "http://127.0.0.1:1/v1",
    apiKey: "test-key",
  });
  store.upsertModel({
    id: "speech-model",
    providerId: "speech-provider",
    name: "gpt-4o-mini-tts",
  });
  store.close();

  return {
    consoleHome,
    rootPath,
    runtime: {
      cwd: ".",
      rootPath,
      logger: createLogger(),
      config: {
        name: "demo",
        version: "1.0.0",
        model: {
          primary: "demo-model",
        },
        plugins: {
          tts: {
            enabled: true,
            modelId: "speech-model",
            voice: "alloy",
            format: "mp3",
          },
        },
      },
      env: {},
      systems: [],
      context: {},
      services: {
        async invoke() {
          return { success: false, error: "unused" };
        },
      },
      plugins: {
        list() {
          return [];
        },
        async availability() {
          return {
            enabled: true,
            available: true,
            reasons: [],
          };
        },
        async runAction() {
          return {
            success: false,
            error: "unused",
            message: "unused",
          };
        },
        async pipeline(_pointName, value) {
          return value;
        },
        async guard() {},
        async effect() {},
        async resolve() {
          return {};
        },
      },
    },
  };
}

test("tts plugin synthesize action creates audio file and returns file tag", async (t) => {
  const speechServer = await createSpeechServer();
  const { runtime, consoleHome } = await createRuntime();

  t.after(async () => {
    await speechServer.close();
  });

  const store = new ConsoleStore(path.join(consoleHome, ".downcity", "downcity.db"));
  await store.upsertProvider({
    id: "speech-provider",
    type: "open-compatible",
    baseUrl: speechServer.baseUrl,
    apiKey: "test-key",
  });
  store.close();

  const previousHome = process.env.HOME;
  process.env.HOME = consoleHome;

  try {
    const result = await ttsPlugin.actions.synthesize.execute({
      context: runtime,
      payload: {
        text: "你好，世界",
      },
      pluginName: "tts",
      actionName: "synthesize",
    });

    assert.equal(result.success, true);
    assert.equal(typeof result.data.outputPath, "string");
    assert.equal(typeof result.data.fileTag, "string");
    assert.match(result.data.fileTag, /<file type="audio">/);

    const outputPath = path.join(runtime.rootPath, result.data.outputPath);
    assert.equal(fs.existsSync(outputPath), true);
    assert.deepEqual(fs.readFileSync(outputPath), speechServer.audioBuffer);

    assert.deepEqual(speechServer.getLastRequestBody(), {
      model: "gpt-4o-mini-tts",
      input: "你好，世界",
      voice: "alloy",
      response_format: "mp3",
    });
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
  }
});
