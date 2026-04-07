import readline from "node:readline";

let nextSessionId = 1;
let nextPermissionId = 1000;
const pendingPermissionByPromptId = new Map();
const pendingPromptBySessionId = new Map();
const brokenSessionIds = new Set();
const toolCancelStateBySessionId = new Map();

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function sendTextUpdate(sessionId, text) {
  send({
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text,
        },
      },
    },
  });
}

function sendToolCallUpdate(sessionId, toolCall) {
  send({
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId,
      update: {
        sessionUpdate: "tool_call",
        ...toolCall,
      },
    },
  });
}

function sendToolResultUpdate(sessionId, toolResult) {
  send({
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId,
      update: {
        sessionUpdate: "tool_call_update",
        ...toolResult,
      },
    },
  });
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on("line", (line) => {
  const raw = String(line || "").trim();
  if (!raw) return;
  const msg = JSON.parse(raw);

  if (typeof msg.method === "string" && msg.id === undefined) {
    if (msg.method === "session/cancel") {
      const sessionId = String(msg.params?.sessionId || "");
      const toolCancelState = toolCancelStateBySessionId.get(sessionId);
      if (toolCancelState) {
        toolCancelState.cancelled = true;
        if (toolCancelState.toolResultSent) {
          toolCancelStateBySessionId.delete(sessionId);
          send({
            jsonrpc: "2.0",
            id: toolCancelState.promptId,
            result: {
              stopReason: "cancelled",
            },
          });
        }
        return;
      }
      const pendingPrompt = pendingPromptBySessionId.get(sessionId);
      if (!pendingPrompt) return;
      pendingPromptBySessionId.delete(sessionId);
      send({
        jsonrpc: "2.0",
        id: pendingPrompt.promptId,
        result: {
          stopReason: "cancelled",
        },
      });
    }
    return;
  }

  if (typeof msg.method === "string" && msg.id !== undefined) {
    if (msg.method === "initialize") {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: 1,
          agentCapabilities: {
            sessionCapabilities: {},
          },
          agentInfo: {
            name: "fixture-acp-agent",
            version: "1.0.0",
          },
          authMethods: [],
        },
      });
      return;
    }

    if (msg.method === "session/new") {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          sessionId: `sess_${nextSessionId++}`,
        },
      });
      return;
    }

    if (msg.method === "session/prompt") {
      const promptText = Array.isArray(msg.params?.prompt)
        ? msg.params.prompt
            .map((item) => String(item?.text || ""))
            .join("\n")
            .trim()
        : "";
      const sessionId = String(msg.params?.sessionId || "");

      if (promptText.includes("permission test")) {
        const permissionId = nextPermissionId++;
        pendingPermissionByPromptId.set(permissionId, {
          promptId: msg.id,
          sessionId,
        });
        send({
          jsonrpc: "2.0",
          id: permissionId,
          method: "session/request_permission",
          params: {
            sessionId,
            options: [
              {
                optionId: "deny",
                kind: "deny",
              },
              {
                optionId: "allow-once",
                kind: "allow_once",
              },
            ],
          },
        });
        return;
      }

      if (promptText.includes("stream progress test")) {
        sendTextUpdate(sessionId, "第一段输出，");
        sendTextUpdate(sessionId, "第二段输出。");
        sendTextUpdate(sessionId, "第三段收尾");
        send({
          jsonrpc: "2.0",
          id: msg.id,
          result: {
            stopReason: "end_turn",
          },
        });
        return;
      }

      if (promptText.includes("exit after response test")) {
        sendTextUpdate(sessionId, "KIMI_EXIT_OK");
        send({
          jsonrpc: "2.0",
          id: msg.id,
          result: {
            stopReason: "end_turn",
          },
        });
        setImmediate(() => {
          process.exit(0);
        });
        return;
      }

      if (promptText.includes("env token test")) {
        sendTextUpdate(
          sessionId,
          process.env.DC_AGENT_TOKEN ? "TOKEN_PRESENT" : "TOKEN_ABSENT",
        );
        send({
          jsonrpc: "2.0",
          id: msg.id,
          result: {
            stopReason: "end_turn",
          },
        });
        return;
      }

      if (promptText.includes("tool call stream test")) {
        sendTextUpdate(sessionId, "正在分析项目结构...");
        sendToolCallUpdate(sessionId, {
          toolCallId: "call_001",
          _meta: {
            claudeCode: {
              toolName: "list_files",
            },
          },
          status: "pending",
          rawInput: {
            path: ".",
          },
        });
        sendToolResultUpdate(sessionId, {
          toolCallId: "call_001",
          _meta: {
            claudeCode: {
              toolName: "list_files",
            },
          },
          status: "completed",
          rawOutput: {
            files: ["package.json", "src/index.ts"],
          },
        });
        sendTextUpdate(sessionId, "分析完成，这是最终结果。");
        send({
          jsonrpc: "2.0",
          id: msg.id,
          result: {
            stopReason: "end_turn",
          },
        });
        return;
      }

      if (promptText.includes("cancel after tool result test")) {
        toolCancelStateBySessionId.set(sessionId, {
          promptId: msg.id,
          cancelled: false,
          toolResultSent: false,
        });
        sendTextUpdate(sessionId, "先发一段前置文本。");
        sendToolCallUpdate(sessionId, {
          toolCallId: "call_cancel_after_result",
          _meta: {
            claudeCode: {
              toolName: "search_tweets",
            },
          },
          status: "pending",
          rawInput: {
            query: "AI artificial intelligence",
          },
        });
        setTimeout(() => {
          const state = toolCancelStateBySessionId.get(sessionId);
          if (!state) return;
          state.toolResultSent = true;
          sendToolResultUpdate(sessionId, {
            toolCallId: "call_cancel_after_result",
            _meta: {
              claudeCode: {
                toolName: "search_tweets",
              },
            },
            status: "completed",
            rawOutput: {
              items: ["tweet-1", "tweet-2"],
            },
          });
          if (state.cancelled) {
            toolCancelStateBySessionId.delete(sessionId);
            send({
              jsonrpc: "2.0",
              id: state.promptId,
              result: {
                stopReason: "cancelled",
              },
            });
            return;
          }
          setTimeout(() => {
            const latest = toolCancelStateBySessionId.get(sessionId);
            if (!latest) return;
            if (latest.cancelled) {
              toolCancelStateBySessionId.delete(sessionId);
              send({
                jsonrpc: "2.0",
                id: latest.promptId,
                result: {
                  stopReason: "cancelled",
                },
              });
              return;
            }
            sendTextUpdate(sessionId, "工具完成后继续给最终答案。");
            toolCancelStateBySessionId.delete(sessionId);
            send({
              jsonrpc: "2.0",
              id: latest.promptId,
              result: {
                stopReason: "end_turn",
              },
            });
          }, 40);
        }, 80);
        return;
      }

      if (promptText.includes("cancel runtime test")) {
        sendTextUpdate(sessionId, "等待取消前的部分输出");
        pendingPromptBySessionId.set(sessionId, {
          promptId: msg.id,
        });
        return;
      }

      if (promptText.includes("cancel empty runtime test")) {
        pendingPromptBySessionId.set(sessionId, {
          promptId: msg.id,
        });
        return;
      }

      if (promptText.includes("rpc error turn test")) {
        brokenSessionIds.add(sessionId);
        send({
          jsonrpc: "2.0",
          id: msg.id,
          error: {
            code: -32603,
            message: "Internal error",
          },
        });
        return;
      }

      if (promptText.includes("follow up after reset test")) {
        if (promptText.includes("## Conversation History")) {
          sendTextUpdate(sessionId, "RESET_BOOTSTRAP_OK");
        } else {
          sendTextUpdate(sessionId, brokenSessionIds.has(sessionId) ? "RESET_FAILED_STALE_SESSION" : "RESET_NOT_BOOTSTRAPPED");
        }
        send({
          jsonrpc: "2.0",
          id: msg.id,
          result: {
            stopReason: "end_turn",
          },
        });
        return;
      }

      if (promptText.includes("## Conversation History")) {
        sendTextUpdate(sessionId, "BOOTSTRAP_OK");
      } else {
        sendTextUpdate(sessionId, `ECHO:${promptText}`);
      }
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          stopReason: "end_turn",
        },
      });
      return;
    }
  }

  if (typeof msg.id === "number" && msg.result?.outcome) {
    const pending = pendingPermissionByPromptId.get(msg.id);
    if (!pending) return;
    pendingPermissionByPromptId.delete(msg.id);
    const selectedId = String(msg.result?.outcome?.optionId || "");
    sendTextUpdate(
      pending.sessionId,
      selectedId === "allow-once" ? "PERMISSION_OK" : "PERMISSION_DENIED",
    );
    send({
      jsonrpc: "2.0",
      id: pending.promptId,
      result: {
        stopReason: "end_turn",
      },
    });
  }
});
