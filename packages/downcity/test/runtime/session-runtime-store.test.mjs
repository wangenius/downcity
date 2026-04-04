/**
 * SessionRuntimeStore / SessionPersistorStore 拆分测试（node:test）。
 *
 * 关键点（中文）
 * - runtime 缓存与 persistor 缓存应该是两个独立职责。
 * - 清理 runtime 时，不应顺带清理 persistor。
 * - 新的主入口名称应该是 `SessionRuntimeStore`。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { SessionPersistorStore } from "../../bin/sessions@/city/runtime/console/SessionPersistorStore.js";
import { SessionRuntimeStore } from "../../bin/sessions/SessionRuntimeStore.js";

test("SessionRuntimeStore recreates runtime without recreating persistor after clearRuntime", () => {
  const createdPersistors = [];
  const createdRuntimes = [];

  const persistorStore = new SessionPersistorStore({
    createPersistor(sessionId) {
      const persistor = {
        sessionId,
        tag: `persistor:${createdPersistors.length + 1}`,
      };
      createdPersistors.push(persistor);
      return persistor;
    },
  });

  const runtimeStore = new SessionRuntimeStore({
    persistorStore,
    createRuntime({ sessionId, persistor }) {
      const runtime = {
        sessionId,
        persistor,
        tag: `runtime:${createdRuntimes.length + 1}`,
      };
      createdRuntimes.push(runtime);
      return runtime;
    },
  });

  const firstPersistor = runtimeStore.getPersistor("chat-a");
  const firstRuntime = runtimeStore.getRuntime("chat-a");

  runtimeStore.clearRuntime("chat-a");

  const secondPersistor = runtimeStore.getPersistor("chat-a");
  const secondRuntime = runtimeStore.getRuntime("chat-a");

  assert.equal(firstPersistor, secondPersistor);
  assert.notEqual(firstRuntime, secondRuntime);
  assert.equal(secondRuntime.persistor, firstPersistor);
  assert.equal(createdPersistors.length, 1);
  assert.equal(createdRuntimes.length, 2);
});
