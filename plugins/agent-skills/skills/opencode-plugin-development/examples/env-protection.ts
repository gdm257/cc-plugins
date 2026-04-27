import type { Plugin } from "@opencode-ai/plugin"

const SENSITIVE_PATTERNS = [".env", ".env.", "credentials", "secret", "api_key", "password"]

export const EnvProtectionPlugin: Plugin = async ({ client }) => {
  console.log("Environment protection plugin initialized!")

  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "read") {
        const filePath = output.args.filePath || input.args.filePath

        for (const pattern of SENSITIVE_PATTERNS) {
          if (filePath?.toLowerCase().includes(pattern)) {
            await client.app.log({
              body: {
                service: "env-protection",
                level: "warn",
                message: `Blocked access to sensitive file: ${filePath}`,
              },
            })

            throw new Error(`Access to sensitive file blocked: ${filePath}`)
          }
        }
      }

      if (input.tool === "bash") {
        const command = output.args.command || input.args.command

        const dangerous = ["rm -rf", "mkfs", ":(){:|:&}:", "> /dev/sda", "dd if=/dev/zero"]

        for (const pattern of dangerous) {
          if (command.includes(pattern)) {
            await client.app.log({
              body: {
                service: "env-protection",
                level: "error",
                message: `Blocked dangerous command: ${pattern}`,
              },
            })

            throw new Error(`Dangerous command blocked: ${pattern}`)
          }
        }
      }
    },

    "file.edited": async (input) => {
      for (const pattern of SENSITIVE_PATTERNS) {
        if (input.filePath?.toLowerCase().includes(pattern)) {
          await client.app.log({
            body: {
              service: "env-protection",
              level: "warn",
              message: `Sensitive file modified: ${input.filePath}`,
            },
          })
        }
      }
    },
  }
}
