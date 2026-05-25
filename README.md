# Downcity

[English](./README.md) | [简体中文](./README.zh-CN.md)

> Turn a code repository into a conversational, executable, and observable agent runtime.

Downcity is an agent platform for local projects and team workflows. It combines your repository, models, sessions, tools, services, plugins, and control plane into one system so a project can run long-lived agents with traceable execution and extensible interfaces.

## Why Downcity

- Repo-native agent runtime: the repository is the working context, memory boundary, and execution surface.
- Platform plus runtime separation: `@downcity/city` manages the platform; `@downcity/agent` focuses on single-agent execution.
- Long-running operations: run agents as managed daemons, inspect status, review history, and interact through CLI or Console.
- Observable by default: sessions, logs, runtime state, and operational surfaces are designed to be inspectable.
- Extensible architecture: services, plugins, SDK APIs, and UI components are all designed as explicit integration surfaces.

## Packages

| Package | Purpose |
| --- | --- |
| `@downcity/city` | Platform layer and CLI for city runtime, Console gateway, multi-agent registration, model pool, global config, and daemon management. |
| `@downcity/agent` | Single-agent runtime and SDK for sessions, tool loops, services, plugins, HTTP/RPC, sandboxing, and host integration. |
| `@downcity/ui` | React + Tailwind UI SDK for reusable Console and host-application components. |
| `products/chrome-extension` | Chrome extension for Console connectivity, page context, and inline composition workflows. |
| `homepage` | Official website and end-user documentation site. |

## Core Capabilities

- Repo is the Agent: initialize a project with `PROFILE.md`, `SOUL.md`, `downcity.json`, and `.downcity/`.
- City control plane: run `city start` or `city console` to manage agents and access the control surface.
- Agent daemon lifecycle: create, start, stop, restart, inspect, chat with, and diagnose project agents.
- Global model pool: manage providers and models through `city model`, then bind projects to model IDs.
- Built-in services: `chat`, `task`, `memory`, `shell`, and `contact`.
- Built-in plugins: `skill`, `auth`, `web`, `asr`, `tts`, and `workboard`.
- SDK access: embed a local agent or call a remote agent over HTTP.

## Quick Start

### 1. Install the CLI

```bash
npm install -g @downcity/city
# or
npm install -g downcity
# or
pnpm add -g @downcity/city
# or
pnpm add -g downcity
```

Both commands below are equivalent:

```bash
city --version
downcity --version
```

`@downcity/city` and `downcity` publish the same CLI contents. `city update` upgrades whichever package you originally installed globally.

### 2. Initialize the platform

```bash
city init
```

This sets up the global Downcity storage and configuration, by default under `~/.downcity/`.

### 3. Configure a model

```bash
city model create
city model list
city model use <modelId>
city model test model <modelId>
```

`city` resolves `downcity.json.execution.modelId` into a runtime `LanguageModel` and injects it into agent sessions.

### 4. Create an agent project

Run this inside the target repository:

```bash
city agent create .
```

This creates or updates:

```text
your-project/
├── PROFILE.md
├── SOUL.md
├── downcity.json
├── .agents/
│   └── skills/
└── .downcity/
    ├── cache/
    ├── config/
    ├── data/
    ├── debug/
    ├── logs/
    ├── profile/
    ├── public/
    ├── schema/
    ├── session/
    └── tasks/
```

### 5. Start the agent and talk to it

```bash
city agent start .
city agent status .
city agent chat -m "Summarize this repository"
```

To run in the foreground:

```bash
city agent start . --foreground
```

### 6. Start Console

```bash
city start --console
# or
city console
```

Useful status commands:

```bash
city status
city agent list
city console status
```

## SDK Example

### Local agent

```ts
import { Agent } from "@downcity/agent";
import { createOpenAI } from "@ai-sdk/openai";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const agent = new Agent({
  id: "repo-helper",
  path: "/path/to/project",
  tools: {},
});

const session = await agent.session();
await session.set({
  model: openai.responses("gpt-5"),
});

const turn = await session.prompt({
  query: "Summarize the repository structure",
});
const result = await turn.finished;

console.log(result.text);
```

`@downcity/agent` does not resolve provider or model IDs for you. In SDK mode, the host application creates the model and injects it into the session.

### Remote agent

```ts
import { RemoteAgent } from "@downcity/agent";

const agent = new RemoteAgent({
  baseUrl: "http://127.0.0.1:15314",
});

const session = await agent.session();
const turn = await session.prompt({
  query: "Check the latest task execution status",
});
const result = await turn.finished;

console.log(result.text);
```

## Repository Layout

```text
downcity/
├── packages/
│   ├── agent/
│   ├── city/
│   └── ui/
├── products/
│   └── chrome-extension/
├── homepage/
├── scripts/
├── package.json
└── pnpm-workspace.yaml
```

## Documentation

- Product docs: [downcity.ai/docs](https://downcity.ai/docs)
- Agent SDK docs: [downcity.ai/agent-sdk-docs](https://downcity.ai/agent-sdk-docs)
- UI SDK docs: [downcity.ai/ui-sdk-docs](https://downcity.ai/ui-sdk-docs)
- Developer docs: [downcity.ai/devdocs](https://downcity.ai/devdocs)
- Chinese overview: [README.zh-CN.md](./README.zh-CN.md)
- Package docs: [packages/agent/README.md](./packages/agent/README.md), [packages/city/README.md](./packages/city/README.md), [packages/ui/README.md](./packages/ui/README.md)

## Local Development

Install dependencies:

```bash
pnpm install
```

Build:

```bash
pnpm build
pnpm build:agent
pnpm build:city
pnpm build:homepage
pnpm build:extension
```

Typecheck:

```bash
pnpm typecheck
pnpm -C packages/ui typecheck
pnpm -C homepage typecheck
```

Run in development mode:

```bash
pnpm dev:city
pnpm dev:agent
pnpm dev:ui-sdk
pnpm dev:console
pnpm dev:homepage
```

## Security and Runtime Notes

- Downcity can execute shell commands, read and write project files, start local daemons, and receive external messages through chat channels.
- Use a clean Git branch and audit changes with `git status` and `git diff`.
- Keep secrets out of the repository; prefer local environment variables or `city env`.
- Use tokens and auth boundaries for Console, HTTP access, and chat channel integrations.
- Tighten command execution boundaries through sandbox configuration where appropriate.
