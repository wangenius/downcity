# downcity

## install

```bash
npm install -g downcity
city -v
downcity -v
```

> `city` 与 `downcity` 指向同一个 CLI。

## quick start

### 1. initialize console

```bash
city console init
city console start
```

### 2. initialize agent project

```bash
cd /path/to/your-repo
city agent create .
```

### 3. configure model

Create project `.env`:

```bash
LLM_API_KEY=your_key
```

Minimal `downcity.json`:

```json
{
  "name": "my-agent",
  "version": "1.0.0",
  "model": {
    "primary": "default"
  }
}
```

### 4. start agent

```bash
city agent start
```

Debug in foreground:

```bash
city agent start --foreground
```

## verify

```bash
city agent status
city console agents
city service list
```

## troubleshooting

### `city: command not found`

Check npm global prefix and PATH:

```bash
npm config get prefix
echo $PATH
```

If the prefix bin is not in PATH, add it:

```bash
export PATH="$(npm config get prefix)/bin:$PATH"
```

Then reload shell:

```bash
rehash
city -v
```

### `sudo city: command not found`

`sudo` may use a different PATH from your user shell.

Prefer running `city` directly. If you really need `sudo`, use:

```bash
sudo env "PATH=$(npm config get prefix)/bin:$PATH" city -v
```

### `downcity` works but `city` does not

Reinstall the global package or relink it:

```bash
npm install -g downcity
```

For local source development:

```bash
cd /path/to/downcity/packages/downcity
npm install
npm run build
npm link
rehash
city -v
```

## api

```http
GET http://localhost:<agent-port>/health
GET http://localhost:<agent-port>/api/status

POST http://localhost:<agent-port>/api/execute
Content-Type: application/json

{"instructions":"Say hi"}
```

Use `city agent status` or `city console agents` to inspect the actual agent port.

## debug

By default the runtime logs every LLM request payload (messages + system) to help debugging.

- Disable: set `llm.logMessages=false` in `downcity.json`
