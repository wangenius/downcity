# Downcity

[English](./README.md) | [简体中文](./README.zh-CN.md)

> Turn a code repository into a conversational, executable, and observable agent runtime.

Downcity is an agent platform for local projects and team workflows. It combines your repository, models, sessions, tools, services, plugins, and control plane into one system so a project can run long-lived agents with traceable execution and extensible interfaces.

## Why Downcity

- Repo-native agent runtime: the repository is the working context, memory boundary, and execution surface.
- Platform plus runtime separation: `@downcity/studio-cli` manages the platform; `@downcity/agent` focuses on single-agent execution.
- Long-running operations: run agents as managed daemons, inspect status, review history, and interact through CLI or Console.
- Observable by default: sessions, logs, runtime state, and operational surfaces are designed to be inspectable.
- Extensible architecture: services, plugins, SDK APIs, and UI components are all designed as explicit integration surfaces.

## Packages

| Package | Purpose |
| --- | --- |
| `@downcity/studio-cli` | Platform layer and CLI for city runtime, Console gateway, multi-agent registration, model pool, global config, and daemon management. |
| `@downcity/agent` | Single-agent runtime and SDK for sessions, tool loops, services, plugins, HTTP/RPC, sandboxing, and host integration. |
| `@downcity/city` | Infrastructure runtime for service registration, actions, auth, env, product-scoped access, and HTTP routing. |
| `@downcity/services` | Public services for accounts, balance, usage, payment, and Stripe payment flows. |
| `@downcity/gate` | User and admin SDK for calling Downcity services over HTTP. |
| `@downcity/ui` | React + Tailwind UI SDK for reusable Console and host-application components. |
| `cities/*` | Deployable city blocks that compose infra and services for Node or edge runtimes. |
| `products/chrome-extension` | Chrome extension for Console connectivity, page context, and inline composition workflows. |
| `homepage` | Official website and end-user documentation site. |

## Core Capabilities

- Repo is the Agent: initialize a project with `PROFILE.md`, `SOUL.md`, `downcity.json`, and `.downcity/`.
- City control plane: run `studio start` or `studio console` to manage agents and access the control surface.
- Agent daemon lifecycle: create, start, stop, restart, inspect, chat with, and diagnose project agents.
- Global model pool: manage providers and models through `studio model`, then bind projects to model IDs.
- City Infra: reuse one shared service infrastructure across products with `@downcity/city`, `@downcity/services`, `@downcity/gate`, and deployable `cities/*`.
- Built-in services: `chat`, `task`, `memory`, `shell`, and `contact`.
- Built-in plugins: `skill`, `auth`, `web`, `asr`, `tts`, and `workboard`.
- SDK access: embed a local agent or call a remote agent over HTTP.

## Quick Start

### 1. Install the CLI

```bash
npm install -g @downcity/studio-cli
# or
npm install -g downcity
# or
pnpm add -g @downcity/studio-cli
# or
pnpm add -g downcity
```

Both commands below are equivalent:

```bash
studio --version
downstudio --version
```

`@downcity/studio-cli` and `downcity` publish the same CLI contents. `studio update` upgrades whichever package you originally installed globally.

### 2. Initialize the platform

```bash
studio init
```

This sets up the global Downcity storage and configuration, by default under `~/.downcity/`.

### 3. Configure a model

```bash
studio model create
studio model list
studio model use <modelId>
studio model test model <modelId>
```

`studio` resolves `downcity.json.execution.modelId` into a runtime `LanguageModel` and injects it into agent sessions.

### 4. Create an agent project

Run this inside the target repository:

```bash
studio agent create .
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
studio agent start .
studio agent status .
studio agent chat -m "Summarize this repository"
```

To run in the foreground:

```bash
studio agent start . --foreground
```

### 6. Start Console

```bash
studio start --console
# or
studio console
```

Useful status commands:

```bash
studio status
studio agent list
studio console status
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
│   ├── conduit/
│   ├── infra/
│   ├── services/
│   └── ui/
├── cities/
│   ├── edge/
│   ├── node/
│   └── shared/
├── products/
│   └── chrome-extension/
├── homepage/
├── scripts/
├── package.json
└── pnpm-workspace.yaml
```

## Documentation

- Product docs: [downcity.ai/docs](https://downcity.ai/docs)
- City docs: [downcity.ai/docs/city](https://downcity.ai/docs/city)
- Agent SDK docs: [downcity.ai/agent-sdk-docs](https://downcity.ai/agent-sdk-docs)
- UI SDK docs: [downcity.ai/ui-sdk-docs](https://downcity.ai/ui-sdk-docs)
- Developer docs: [downcity.ai/devdocs](https://downcity.ai/devdocs)
- Chinese overview: [README.zh-CN.md](./README.zh-CN.md)
- Package docs: [packages/agent/README.md](./packages/agent/README.md), [packages/city/README.md](./packages/city/README.md), [packages/services/README.md](./packages/services/README.md), [packages/gate/README.md](./packages/gate/README.md), [packages/studio-cli/README.md](./packages/studio-cli/README.md), [packages/ui/README.md](./packages/ui/README.md)

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
- Keep secrets out of the repository; prefer local environment variables or `studio env`.
- Use tokens and auth boundaries for Console, HTTP access, and chat channel integrations.
- Tighten command execution boundaries through sandbox configuration where appropriate.
