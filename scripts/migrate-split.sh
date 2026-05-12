#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/wangenius/Documents/github/downcity"
OLD_SRC="$ROOT/packages/downcity/src"
AGENT_SRC="$ROOT/packages/agent/src"
CITY_SRC="$ROOT/packages/city/src"

echo "=== Copying entire src to both packages ==="
rm -rf "$AGENT_SRC" "$CITY_SRC"
mkdir -p "$AGENT_SRC" "$CITY_SRC"

cp -r "$OLD_SRC"/* "$AGENT_SRC"/
cp -r "$OLD_SRC"/* "$CITY_SRC"/

echo "=== Removing files from agent that belong to city ==="
# agent does NOT have: main/city/daemon (except ProjectSetup), main/city/runtime (except AgentHostRuntime/PluginRuntime),
# main/modules/cli, main/modules/console, main/city/model/ModelManager, services/, plugins/
cd "$AGENT_SRC"

# Remove city-only dirs
rm -rf main/city/daemon
rm -rf main/city/runtime
rm -rf main/city/model
rm -rf main/modules/cli
rm -rf main/modules/console
rm -rf services
rm -rf plugins

echo "=== Removing files from city that belong to agent ==="
cd "$CITY_SRC"

# city does NOT have: main/agent, session, sandbox, main/modules/http, main/modules/rpc
rm -rf main/agent
rm -rf session
rm -rf sandbox
rm -rf main/modules/http
rm -rf main/modules/rpc

echo "=== Done copying ==="
