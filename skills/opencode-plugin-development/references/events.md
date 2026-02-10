# OpenCode Events Reference

Complete reference for all available events in OpenCode plugins.

## Event Hook Patterns

OpenCode plugins handle events through two patterns:

### 1. Generic Event Hook

All events can be captured via the generic `event` hook:

```typescript
event: async ({ event }) => {
  // event: { type: string, ...event-specific-fields }
}
```

### 2. Output-Modifiable Hooks

Some hooks support modifying output parameters:

```typescript
"event.name": async (input, output) => {
  // input: { ... }
  // output: { ...modify output fields... }
}
```

## Session Events

All session events are captured via the generic `event` hook:

```typescript
event: async ({ event }) => {
  switch (event.type) {
    case "session.created":
      // event: { type: "session.created", sessionID: string, mode?: string }
      break
    case "session.compacted":
      // event: { type: "session.compacted", sessionID: string, ... }
      break
    case "session.deleted":
      // event: { type: "session.deleted", sessionID: string }
      break
    case "session.diff":
      // event: { type: "session.diff", sessionID: string, diff: string }
      break
    case "session.error":
      // event: { type: "session.error", sessionID: string, error: string }
      break
    case "session.idle":
      // event: { type: "session.idle", sessionID: string }
      break
    case "session.status":
      // event: { type: "session.status", sessionID: string, status: string }
      break
    case "session.updated":
      // event: { type: "session.updated", sessionID: string, updates: object }
      break
  }
}
```

**Example:**

```typescript
export const SessionTracker: Plugin = async ({ client }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.created") {
        await client.app.log({
          body: {
            service: "session-tracker",
            level: "info",
            message: `Session created: ${event.sessionID}`,
          },
        })
      }
    },
  }
}
```

## Tool Events

### tool.execute.before

Fires before tool execution. Can modify arguments.

**Handler Signature:**

```typescript
"tool.execute.before": async (input, output) => {
  input: {
    tool: string
    sessionID: string
    callID: string
  }
  output: {
    args: any
  }
}
```

**Example:**

```typescript
export const BashSanitizer: Plugin = async () => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "bash") {
        const dangerous = ["rm -rf", "mkfs", ":(){:|:&}:"]
        for (const pattern of dangerous) {
          if (output.args.command.includes(pattern)) {
            throw new Error(`Blocked dangerous command: ${pattern}`)
          }
        }
      }
    },
  }
}
```

### tool.execute.after

Fires after tool execution. Can modify the result.

**Handler Signature:**

```typescript
"tool.execute.after": async (input, output) => {
  input: {
    tool: string
    sessionID: string
    callID: string
  }
  output: {
    title: string
    output: string
    metadata: any
  }
}
```

**Example:**

```typescript
export const ResultModifier: Plugin = async () => {
  return {
    "tool.execute.after": async (input, output) => {
      if (input.tool === "bash") {
        output.output = output.output.trim()
      }
    },
  }
}
```

## Shell Events

### shell.env

Fires when shell environment is being prepared. Use to inject environment variables.

**Handler Signature:**

```typescript
event: async ({ event }) => {
  if (event.type === "shell.env") {
    // event: { type: "shell.env", cwd: string, env: Record<string, string> }
    event.env.OPENCODE_PLUGIN = "active"
    event.env.NODE_ENV = "development"
  }
}
```

## File Events

All file events are captured via the generic `event` hook:

```typescript
event: async ({ event }) => {
  switch (event.type) {
    case "file.edited":
      // event: { type: "file.edited", filePath: string, changes: object }
      break
    case "file.watcher.updated":
      // event: { type: "file.watcher.updated", filePath: string, event: string }
      break
  }
}
```

## Message Events

All message events are captured via the generic `event` hook:

```typescript
event: async ({ event }) => {
  switch (event.type) {
    case "message.part.removed":
      // event: { type: "message.part.removed", messageId: string, partIndex: number }
      break
    case "message.part.updated":
      // event: { type: "message.part.updated", messageId: string, partIndex: number, content: string }
      break
    case "message.removed":
      // event: { type: "message.removed", messageId: string }
      break
    case "message.updated":
      // event: { type: "message.updated", messageId: string, content: string }
      break
  }
}
```

## Command Events

### command.execute.before

Fires before a command is executed. Can modify the response parts.

**Handler Signature:**

```typescript
"command.execute.before": async (input, output) => {
  input: {
    command: string
    sessionID: string
    arguments: string
  }
  output: {
    parts: Part[]
  }
}
```

### Other Command Events

All other command events are captured via the generic `event` hook:

```typescript
event: async ({ event }) => {
  if (event.type === "command.executed") {
    // event: { type: "command.executed", command: string, exitCode: number }
  }
}
```

## Message Events

### chat.message

Fires when a new message is received. Can modify the message and parts.

**Handler Signature:**

```typescript
"chat.message": async (input, output) => {
  input: {
    sessionID: string
    agent?: string
    model?: { providerID: string; modelID: string }
    messageID?: string
    variant?: string
  }
  output: {
    message: UserMessage
    parts: Part[]
  }
}
```

### chat.params

Modify parameters sent to LLM.

**Handler Signature:**

```typescript
"chat.params": async (input, output) => {
  input: {
    sessionID: string
    agent: string
    model: Model
    provider: ProviderContext
    message: UserMessage
  }
  output: {
    temperature: number
    topP: number
    topK: number
    options: Record<string, any>
  }
}
```

### chat.headers

Modify headers sent with LLM requests.

**Handler Signature:**

```typescript
"chat.headers": async (input, output) => {
  input: {
    sessionID: string
    agent: string
    model: Model
    provider: ProviderContext
    message: UserMessage
  }
  output: {
    headers: Record<string, string>
  }
}
```

## Permission Events

### permission.ask

Fires when a permission is requested. Can override the default behavior.

**Handler Signature:**

```typescript
"permission.ask": async (input, output) => {
  input: Permission
  output: {
    status: "ask" | "deny" | "allow"
  }
}
```

### Other Permission Events

All other permission events are captured via the generic `event` hook:

```typescript
event: async ({ event }) => {
  switch (event.type) {
    case "permission.asked":
      // event: { type: "permission.asked", permission: string, context: object }
      break
    case "permission.replied":
      // event: { type: "permission.replied", permission: string, granted: boolean }
      break
  }
}
```

**Example:**

```typescript
export const PermissionHandler: Plugin = async () => {
  return {
    "permission.ask": async (input, output) => {
      const safePermissions = ["read", "bash"]
      if (safePermissions.includes(input.tool)) {
        output.status = "allow"
      }
    },
  }
}
```

## Other Events

The following events are captured via the generic `event` hook:

```typescript
event: async ({ event }) => {
  switch (event.type) {
    case "installation.updated":
      // event: { type: "installation.updated", package: string, version: string }
      break
    case "server.connected":
      // event: { type: "server.connected", url: string }
      break
    case "todo.updated":
      // event: { type: "todo.updated", todoId: string, changes: object }
      break
  }
}
```

## LSP Events

LSP events are captured via the generic `event` hook:

```typescript
event: async ({ event }) => {
  switch (event.type) {
    case "lsp.client.diagnostics":
      // event: { type: "lsp.client.diagnostics", uri: string, diagnostics: array }
      break
    case "lsp.updated":
      // event: { type: "lsp.updated", server: string }
      break
  }
}
```

## TUI Events

TUI events are captured via the generic `event` hook:

```typescript
event: async ({ event }) => {
  switch (event.type) {
    case "tui.prompt.append":
      // event: { type: "tui.prompt.append", prompt: string }
      break
    case "tui.command.execute":
      // event: { type: "tui.command.execute", command: string }
      break
    case "tui.toast.show":
      // event: { type: "tui.toast.show", message: string, type: string }
      break
  }
}
```

## Experimental Events

### experimental.chat.messages.transform

Transform chat messages before sending to LLM.

**Handler Signature:**

```typescript
"experimental.chat.messages.transform": async (input, output) => {
  input: {}
  output: {
    messages: {
      info: Message
      parts: Part[]
    }[]
  }
}
```

### experimental.chat.system.transform

Transform system prompt.

**Handler Signature:**

```typescript
"experimental.chat.system.transform": async (input, output) => {
  input: {
    sessionID?: string
    model: Model
  }
  output: {
    system: string[]
  }
}
```

### experimental.session.compacting

Fires before session compaction. Can inject context or replace prompt.

**Handler Signature:**

```typescript
"experimental.session.compacting": async (input, output) => {
  input: {
    sessionID: string
  }
  output: {
    context: string[]          // Additional context strings appended to default
    prompt?: string           // Optional: replace entire prompt
  }
}
```

**Example - Inject Context:**

```typescript
export const CompactionPlugin: Plugin = async () => {
  return {
    "experimental.session.compacting": async (input, output) => {
      output.context.push("Project uses Bun + SolidJS")
      output.context.push("Code style: single-word naming preferred")
    },
  }
}
```

**Example - Replace Prompt:**

```typescript
export const CustomCompaction: Plugin = async () => {
  return {
    "experimental.session.compacting": async (input, output) => {
      output.prompt = `You are continuing a session.
Summarize current task and next steps.
Format: Task | Status | Next`
    },
  }
}
```

### experimental.text.complete

Handle text completion.

**Handler Signature:**

```typescript
"experimental.text.complete": async (input, output) => {
  input: {
    sessionID: string
    messageID: string
    partID: string
  }
  output: {
    text: string
  }
}
```

## Config Callback

The `config` callback receives the full OpenCode configuration object.

**Handler Signature:**

```typescript
config: async (config) => {
  // config: Config.Info
  // Modify any configuration field
}
```

**Example:**

```typescript
export const ConfigPlugin: Plugin = async () => {
  return {
    config: async (cfg) => {
      cfg.model = "anthropic/claude-sonnet-4-20250506"
      cfg.experimental ??= {}
      cfg.experimental.batch_tool = true
      cfg.command ??= {}
      cfg.command["myplugin"] = {
        template: "",
        description: "My custom command",
      }
    },
  }
}
```

## Auth Hook

Register custom authentication providers.

**Handler Signature:**

```typescript
auth: {
  provider: string
  loader?: (auth: () => Promise<Auth>, provider: Provider) => Promise<Record<string, any>>
  methods: (
    | {
        type: "oauth"
        label: string
        prompts?: Array<{ type: "text" | "select"; key: string; message: string; ... }>
        authorize(inputs?: Record<string, string>): Promise<AuthOuathResult>
      }
    | {
        type: "api"
        label: string
        prompts?: Array<{ type: "text" | "select"; key: string; message: string; ... }>
        authorize?(inputs?: Record<string, string>): Promise<{ type: "success" | "failed" }>
      }
  )[]
}
```

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
    },
  }
}
```
