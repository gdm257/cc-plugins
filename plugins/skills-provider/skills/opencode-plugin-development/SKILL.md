---
name: opencode-plugin-development
description: This skill should be used when the user asks to "create an OpenCode plugin", "develop an OpenCode plugin", "write an OpenCode plugin", "build an OpenCode plugin", "make an OpenCode plugin", "add a hook to OpenCode", "subscribe to OpenCode events", "create a custom tool for OpenCode", or needs guidance on OpenCode plugin architecture, events, custom tools, TypeScript support, or dependencies management.
version: 1.0.0
---

# OpenCode Plugin Development Guide

Create plugins to extend OpenCode's functionality by hooking into events, adding custom tools, and modifying behavior.

## Overview

OpenCode plugins are JavaScript/TypeScript modules that export a plugin function. The function receives a context object and returns a hooks object defining event hooks and custom tools.

## Plugin Types

OpenCode supports two plugin installation methods:

### Config Plugin Field (Recommended)

Define plugins in your `opencode.json` `plugin` array:

```json
{
  "plugin": ["my-plugin@1.0.0", "@scope/enterprise-plugin"]
}
```

**Characteristics:**

- Plugins are npm packages installed via **Bun**
- Dependencies declared in `package.json` are **automatically installed**
- Published to npm registry for distribution
- Version management via npm versioning
- Suitable for: distributable plugins, plugins with external dependencies

### Local Plugin Directory

Place plugin files directly in `.opencode/plugins/`:

```
.opencode/plugins/
└── my-plugin.ts
```

**Characteristics:**

- Local files loaded via `file://` URLs
- **No dependency installation** - all dependencies must be pre-installed
- Quick iteration for development
- Suitable for: private plugins, prototypes, plugins without external dependencies

**Comparison:**

| Feature                 | Config `plugin` Field | Local `.opencode/plugins/` |
| ----------------------- | --------------------- | -------------------------- |
| Dependency Installation | ✅ Automatic via Bun  | ❌ Manual                  |
| Distribution            | npm package           | Local files                |
| Version Control         | npm versioning        | File-based                 |
| Use Case                | Production plugins    | Development/Private        |

**Recommendation:** Use the config `plugin` field for most plugins.

## Dependencies

**Local plugins in `.opencode/plugins/` cannot import external npm packages.**

Plugins run within the OpenCode server process, which means:

- **Available imports:**
  - Node.js/Bun built-in modules (`fs`, `path`, `http`, etc.)
  - `@opencode-ai/plugin` SDK (official API)
  - Any packages already installed in the OpenCode server environment

- **Cannot import:**
  - Arbitrary npm packages not pre-installed in the server
  - Dependencies from your project's `node_modules`

**Example - Only use built-ins and official SDK:**

```typescript
import type { Plugin } from "@opencode-ai/plugin"
import { readFileSync } from "fs" // ✅ Built-in module
import { client } from "./local" // ✅ Relative import

export const MyPlugin: Plugin = async () => {
  return {
    // Return hooks
  }
}
```

**To use npm dependencies, publish as an npm package:**

1. Create an npm package with your plugin
2. Publish to npm registry
3. Reference it in your config:

```json
{
  "plugin": ["my-plugin@1.0.0"]
}
```

Dependencies declared in the package's `package.json` will be automatically installed via Bun.

## TypeScript Support

Import types from `@opencode-ai/plugin`:

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async (ctx) => {
  // ctx is fully typed
  const { project, client, $, directory, worktree } = ctx

  return {
    // Return hooks
  }
}
```

## Context Properties

The plugin function receives:

| Property    | Type       | Description                    |
| ----------- | ---------- | ------------------------------ |
| `project`   | object     | Current project information    |
| `client`    | SDK client | Interact with the AI assistant |
| `$`         | Bun shell  | Execute shell commands         |
| `directory` | string     | Current working directory      |
| `worktree`  | string     | Git worktree path              |

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  return {
    // Return hooks
  }
}
```

## Hooks Reference

Plugins extend OpenCode through **hooks** - callback functions that run at specific times. A plugin provides hooks to react to events, register custom tools, or modify global configuration.

Complete plugin structure with all available hooks:

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async (input) => {
  return {
    // === Event Hooks (called each time the event occurs) ===
    // Subscribe to all events (session.*, file.*, message.*, etc.)
    event: async ({ event }) => {
      switch (event.type) {
        case "session.idle":
          break
        case "file.edited":
          break
        // ... other events
      }
    },
    // Specific event hooks with custom input/output
    "chat.message": async ({ sessionID, agent, model, messageID, variant }, { message, parts }) => {},
    "chat.params": async ({ sessionID, agent, model, provider, message }, { temperature, topP, topK, options }) => {},
    "chat.headers": async ({ sessionID, agent, model, provider, message }, { headers }) => {},
    "permission.ask": async (input, { status }) => {},
    "command.execute.before": async ({ command, sessionID, arguments }, { parts }) => {},
    "tool.execute.before": async ({ tool, sessionID, callID }, { args }) => {},
    "tool.execute.after": async ({ tool, sessionID, callID }, { title, output, metadata }) => {},
    // Experimental event hooks
    "experimental.chat.messages.transform": async (_, { messages }) => {},
    "experimental.chat.system.transform": async ({ sessionID, model }, { system }) => {},
    "experimental.session.compacting": async ({ sessionID }, { context, prompt }) => {},
    "experimental.text.complete": async ({ sessionID, messageID, partID }, { text }) => {},

    // === Registration Hooks (called once at initialization) ===
    tool: {
      [name: string]: {
        description: string,
        args: { [key: string]: z.ZodType },
        execute: async (args, context) => string,
      },
    },
    auth: {
      provider: string,
      loader: async (getAuth, provider) => Record<string, any>,
      methods: Array<{ type: "oauth" | "api", label: string, authorize: async (inputs?) => {...} }>,
    },
    config: async (config) => {},
  }
}
```

### Hooks Summary

| Hook                                     | Description                                                             | When |
| ---------------------------------------- | ----------------------------------------------------------------------- | ---- |
| **Event Hooks (per-event)**              |
| `event`                                  | Catch all events (session._, file._, message.\*, etc.) via `event.type` | each |
| `chat.message`                           | React to new messages                                                   | each |
| `chat.params`                            | Modify LLM params                                                       | each |
| `chat.headers`                           | Modify LLM headers                                                      | each |
| `permission.ask`                         | Handle permissions                                                      | each |
| `command.execute.before`                 | Before command                                                          | each |
| `tool.execute.before`                    | Before tool                                                             | each |
| `tool.execute.after`                     | After tool                                                              | each |
| **Experimental Event Hooks (per-event)** |
| `experimental.chat.messages.transform`   | Transform messages                                                      | each |
| `experimental.chat.system.transform`     | Transform system                                                        | each |
| `experimental.session.compacting`        | Session compaction                                                      | each |
| `experimental.text.complete`             | Text completion                                                         | each |
| **Registration Hooks (once at init)**    |
| `tool`                                   | Register tools                                                          | init |
| `auth`                                   | Register auth                                                           | init |
| `config`                                 | Modify config                                                           | init |

**All events available via `event` hook:**

| Category     | Events                                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Session      | `session.created`, `session.compacted`, `session.deleted`, `session.diff`, `session.error`, `session.idle`, `session.status`, `session.updated` |
| File         | `file.edited`, `file.watcher.updated`                                                                                                           |
| Message      | `message.updated`, `message.removed`, `message.part.updated`, `message.part.removed`                                                            |
| Command      | `command.executed`                                                                                                                              |
| Permission   | `permission.asked`, `permission.replied`                                                                                                        |
| LSP          | `lsp.client.diagnostics`, `lsp.updated`                                                                                                         |
| Todo         | `todo.updated`                                                                                                                                  |
| Shell        | `shell.env`                                                                                                                                     |
| Server       | `server.connected`, `server.instance.disposed`                                                                                                  |
| Installation | `installation.updated`                                                                                                                          |
| TUI          | `tui.prompt.append`, `tui.command.execute`, `tui.toast.show`, `tui.session.select`                                                              |

## Custom Tools

Add custom tools using the `tool` helper:

```typescript
import { tool } from "@opencode-ai/plugin"

export const CustomToolsPlugin: Plugin = async () => {
  return {
    tool: {
      greet: tool({
        description: "Greet a user by name",
        args: {
          name: tool.schema.string(),
        },
        async execute(args) {
          return `Hello, ${args.name}!`
        },
      }),
      calculate: tool({
        description: "Perform basic calculations",
        args: {
          a: tool.schema.number(),
          b: tool.schema.number(),
          operation: tool.schema.enum(["add", "subtract", "multiply", "divide"]),
        },
        async execute(args) {
          switch (args.operation) {
            case "add":
              return args.a + args.b
            case "subtract":
              return args.a - args.b
            case "multiply":
              return args.a * args.b
            case "divide":
              return args.a / args.b
          }
        },
      }),
    },
  }
}
```

## Slash Commands

Register slash commands and handle their execution using the `config` callback and `command.execute.before` event.

### Command Registration

Use the `config` callback to register slash commands in OpenCode's configuration:

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const SlashCommandPlugin: Plugin = async () => {
  return {
    config: async (cfg) => {
      cfg.command ??= {}
      cfg.command["myplugin"] = {
        template: "",
        description: "Execute my plugin commands",
      }
    },
  }
}
```

**Result:**

- Command `/myplugin` appears in autocomplete when user types `/`
- Description shows in command help UI

### Command Handling

Intercept and process command execution via `command.execute.before`:

```typescript
export const SlashCommandPlugin: Plugin = async () => {
    return {
        "command.execute.before": async (input, _output) => {
            if (input.command === "myplugin") {
                const args = (input.arguments || "").trim().split(/\s+/).filter(Boolean)
                const subcommand = args[0]?.toLowerCase() || ""

                if (subcommand === "status") {
                    // Handle /myplugin status
                    console.log("Status command executed")
                } else if (subcommand === "config") {
                    // Handle /myplugin config
                    console.log("Config command executed")
                } else {
                    // Handle unknown subcommand - show help
                    console.log("Available: status, config")
```

### Config Modifications

The `config` callback receives the full OpenCode configuration object, allowing you to modify settings beyond just commands:

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const ConfigPlugin: Plugin = async () => {
  return {
    config: async (cfg) => {
      // Model configuration
      cfg.model = "anthropic/claude-sonnet-4-20250506"
      cfg.small_model = "anthropic/haiku-4-20250506"
      cfg.default_agent = "build"

      // Agent configuration
      cfg.agent ??= {}
      cfg.agent.build ??= {}
      cfg.agent.build.model = "anthropic/claude-sonnet-4-20250506"
      cfg.agent.build.temperature = 0.5
      cfg.agent.build.prompt = "You are a careful developer."

      // Experimental features
      cfg.experimental ??= {}
      cfg.experimental.batch_tool = true
      cfg.experimental.primary_tools = ["read", "bash", "edit"]
      cfg.experimental.continue_loop_on_deny = true

      // Provider configuration
      cfg.provider ??= {}
      cfg.provider.anthropic ??= {}
      cfg.provider.anthropic.options ??= {}
      cfg.provider.anthropic.options.timeout = 60000

      // Permission configuration
      cfg.permission ??= {}
      cfg.permission.read = "allow"
      cfg.permission.edit = "ask"

      // MCP servers
      cfg.mcp ??= {}
      cfg.mcp["pokemon-server"] = {
        type: "local",
        command: ["uv", "--directory", "/path/to/server", "run", "server"],
        enabled: true,
      }

      // Server settings
      cfg.server ??= {}
      cfg.server.port = 4096
      cfg.server.hostname = "0.0.0.0"
      cfg.server.mdns = true

      // UI settings
      cfg.username = "my-user"
      cfg.share = "manual"

      // Compaction settings
      cfg.compaction ??= {}
      cfg.compaction.auto = true
      cfg.compaction.prune = true

      // Workspace backend
      cfg.workspaceBackend = "git"
    },
  }
}
```

Available configuration fields:

| Field              | Type                             | Description                                                |
| ------------------ | -------------------------------- | ---------------------------------------------------------- |
| `model`            | string                           | Default model (format: `provider/model`)                   |
| `small_model`      | string                           | Small model for auxiliary tasks                            |
| `default_agent`    | string                           | Default agent name                                         |
| `agent`            | object                           | Agent configurations (build, plan, general, explore, etc.) |
| `provider`         | object                           | Custom provider and model overrides                        |
| `command`          | object                           | Slash commands registration                                |
| `mcp`              | object                           | MCP server configurations                                  |
| `experimental`     | object                           | Experimental feature flags                                 |
| `permission`       | object                           | Tool permission policies                                   |
| `server`           | object                           | Server settings (port, hostname, mdns, cors)               |
| `username`         | string                           | Display name                                               |
| `share`            | "manual" \| "auto" \| "disabled" | Sharing behavior                                           |
| `compaction`       | object                           | Session compaction settings                                |
| `workspaceBackend` | "git"                            | Workspace backend                                          |

## Auth Hook

Register custom authentication providers:

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const AuthPlugin: Plugin = async () => {
  return {
    auth: {
      provider: "my-provider",
      methods: [
        {
          type: "oauth",
          label: "Sign in with MyProvider",
          prompts: [{ type: "text", key: "tenant", message: "Enter tenant ID" }],
          authorize: async (inputs) => {
            const response = await fetch("https://my-provider.com/oauth/token", {
              method: "POST",
              body: JSON.stringify({
                client_id: inputs.clientId,
                client_secret: inputs.clientSecret,
                tenant: inputs.tenant,
              }),
            })
            const data = await response.json()
            return {
              type: "success",
              provider: "my-provider",
              refresh: data.refresh_token,
              access: data.access_token,
              expires: data.expires_in,
            }
          },
        },
      ],
    },
  }
}
```

## Logging

Use structured logging via `client.app.log()`:

```typescript
await client.app.log({
  body: {
    service: "my-plugin",
    level: "debug" | "info" | "warn" | "error",
    message: "Log message",
    extra: {
      // Additional context
      foo: "bar",
    },
  },
})
```

## Additional Resources

### Detailed Reference

- **`references/events.md`** - Complete event reference with full type signatures

### Example Plugins

Complete, runnable plugin examples in **`examples/`**:

| File                | Demonstrates                                             |
| ------------------- | -------------------------------------------------------- |
| `notification.ts`   | Session events (`session.created`, `session.idle`, etc.) |
| `env-protection.ts` | `tool.execute.before`, `file.edited` hooks               |
| `inject-env.ts`     | `shell.env` hook, multiple plugin patterns               |
| `compaction.ts`     | `experimental.session.compacting` variations             |
| `custom-tools.ts`   | Custom tool registration with `tool` helper              |
