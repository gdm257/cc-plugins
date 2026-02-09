import { tool } from "@opencode-ai/plugin"
import type { Plugin } from "@opencode-ai/plugin"

export const CustomToolsPlugin: Plugin = async ({ directory, worktree }) => {
  return {
    tool: {
      greet: tool({
        description: "Greet a user by name",
        args: {
          name: tool.schema.string().describe("Name of the person to greet"),
        },
        async execute(args) {
          return `Hello, ${args.name}! Welcome to OpenCode.`
        },
      }),

      upper: tool({
        description: "Convert text to uppercase",
        args: {
          text: tool.schema.string().describe("Text to convert"),
        },
        async execute(args) {
          return args.text.toUpperCase()
        },
      }),

      lower: tool({
        description: "Convert text to lowercase",
        args: {
          text: tool.schema.string().describe("Text to convert"),
        },
        async execute(args) {
          return args.text.toLowerCase()
        },
      }),

      calculate: tool({
        description: "Perform basic arithmetic operations",
        args: {
          a: tool.schema.number().describe("First number"),
          b: tool.schema.number().describe("Second number"),
          operation: tool.schema.enum(["add", "subtract", "multiply", "divide"]).describe("Operation to perform"),
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
              if (args.b === 0) {
                throw new Error("Cannot divide by zero")
              }
              return args.a / args.b
            default:
              throw new Error(`Unknown operation: ${args.operation}`)
          }
        },
      }),

      countLines: tool({
        description: "Count lines in text",
        args: {
          text: tool.schema.string().describe("Text to count lines in"),
        },
        async execute(args) {
          const lines = args.text.split("\n").length
          return `${lines} lines`
        },
      }),

      timestamp: tool({
        description: "Get current timestamp",
        args: {},
        async execute() {
          return {
            iso: new Date().toISOString(),
            unix: Date.now(),
            utc: new Date().toUTCString(),
          }
        },
      }),

      jsonFormat: tool({
        description: "Format and validate JSON",
        args: {
          text: tool.schema.string().describe("JSON string to format"),
        },
        async execute(args) {
          try {
            const parsed = JSON.parse(args.text)
            return JSON.stringify(parsed, null, 2)
          } catch (e) {
            throw new Error(`Invalid JSON: ${e}`)
          }
        },
      }),

      readConfig: tool({
        description: "Read project configuration",
        args: {
          filename: tool.schema.string().describe("Config file name (package.json, tsconfig.json, etc.)"),
        },
        async execute(args, ctx) {
          const { readFile } = await import("fs/promises")
          const path = `${ctx.directory}/${args.filename}`

          try {
            const content = await readFile(path, "utf-8")
            return content
          } catch {
            throw new Error(`File not found: ${args.filename}`)
          }
        },
      }),
    },
  }
}
