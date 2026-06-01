# Downcity

[English](./README.md) | [简体中文](./README.zh-CN.md)

> Agent infrastructure for AI builders shipping many agent-powered products and workflows.

Downcity gives creators, indie builders, and teams one reusable runtime layer for agents, models, tools, tasks, memory, plugins, City, permissions, usage, billing, and control surfaces. Instead of rebuilding the same agent backend for every new AI product, you can run many agents, products, and workflows on one infrastructure stack.

## Why Downcity

- Built for AI builders: create the next agent product without rebuilding model routing, tools, memory, tasks, auth, usage, billing, and operations again.
- Reusable runtime layer: a repo or folder can become an agent boundary, while Downcity owns the broader infrastructure for long-running agents.
- City: centralize model catalogs, runtime env, service routing, accounts, balance, usage, payment, and HTTP access.
- Operable agents: run agents as managed daemons, inspect status, review history, and interact through CLI, Console, browser extension, or SDK.
- Extensible architecture: plugins, services, SDK APIs, and UI components are explicit integration surfaces for products and teams.

## Packages

| Package | Purpose |
| --- | --- |
| `downcity` | Public CLI bundle that installs `town` for local Agent hosting and `city` for City administration. |
| `@downcity/agent` | Single-agent runtime and SDK for sessions, tool loops, services, plugins, HTTP/RPC, sandboxing, and host integration. |
| `@downcity/city` | City runtime and access SDK for Service registration, Actions, auth, env, town-scoped access, and HTTP calling. |
| `@downcity/type` | Shared protocol types used across packages, including City model descriptors returned by City. |
| `@downcity/services` | Public services for accounts, balance, usage, payment, and Stripe payment flows. |
| `@downcity/ui` | React + Tailwind UI SDK for reusable Console and host-application components. |
| `cities/*` | Deployable City compositions that assemble `@downcity/city` and services for Node or edge runtimes. |
| `products/chrome-extension` | Chrome extension for Console connectivity, page context, and inline composition workflows. |
| `homepage` | Official website and end-user documentation site. |

## Core Capabilities

- Agent project runtime: initialize a repo or folder with `PROFILE.md`, `SOUL.md`, `downcity.json`, and `.downcity/`.
- Local hosting and operations: run `town start` or `town console` to host local agents and access the control surface.
- Agent lifecycle: create, start, stop, restart, inspect, chat with, diagnose, and observe project agents.
- City connection: use `town city` to connect local Agents to the active City server; manage City models and Service resources with `city`.
- City backend capabilities: reuse accounts, balance, usage, payment, env, auth, and Service routing across agents and products.
- Built-in agent capabilities: `chat`, `task`, `memory`, `shell`, `contact`, `skill`, `web`, `asr`, `tts`, and `workboard`.
- Product surfaces: Console UI, Chrome Extension, Agent SDK, City SDK, and UI SDK.

## Quick Start

### 1. Install the CLI

```bash
npm install -g downcity
# or
pnpm add -g downcity
```

The package exposes both commands:

```bash
town --version
city --version
```

`town` is the local Agent host command. `city` is the City administration command. Use `town update` to upgrade the global CLI.

### 2. Initialize the platform

```bash
town init
```

This sets up the global Downcity storage and configuration, by default under `~/.downcity/`.

### 3. Connect Town to City

```bash
city
town city use
town city status
```

`city` manages City models and Service resources. `town city` imports the active City connection for local Agent runtime use.

### 4. Create an agent project

Run this inside the target repository:

```bash
town agent create .
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
town agent start .
town agent status .
town agent chat -m "Summarize this repository"
```

To run in the foreground:

```bash
town agent start . --foreground
```

### 6. Start Console

```bash
town start --console
# or
town console
```

Useful status commands:

```bash
town status
town agent list
town console status
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
│   ├── services/
│   ├── type/
│   └── ui/
├── cli/
│   ├── city/
│   ├── town/
│   └── downcity/
├── cities/
│   ├── edge/
│   └── node/
├── products/
│   └── chrome-extension/
├── homepage/
├── scripts/
├── package.json
└── pnpm-workspace.yaml
```

## Documentation

- Docs: [downcity.ai/docs](https://downcity.ai/docs)
- City SDK docs: [downcity.ai/city-sdk-docs](https://downcity.ai/city-sdk-docs)
- Agent SDK docs: [downcity.ai/agent-sdk-docs](https://downcity.ai/agent-sdk-docs)
- UI SDK docs: [downcity.ai/ui-sdk-docs](https://downcity.ai/ui-sdk-docs)
- Chinese overview: [README.zh-CN.md](./README.zh-CN.md)
- Package docs: [packages/agent/README.md](./packages/agent/README.md), [packages/city/README.md](./packages/city/README.md), [packages/type/README.md](./packages/type/README.md), [packages/services/README.md](./packages/services/README.md), [cli/city/README.md](./cli/city/README.md), [cli/town/README.md](./cli/town/README.md), [cli/downcity/README.md](./cli/downcity/README.md), [packages/ui/README.md](./packages/ui/README.md)

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
- Keep secrets out of the repository; prefer local environment variables or `town env`.
- Use tokens and auth boundaries for Console, HTTP access, and chat channel integrations.
- Tighten command execution boundaries through sandbox configuration where appropriate.
