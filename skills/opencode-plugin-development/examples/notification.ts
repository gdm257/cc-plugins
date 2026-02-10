import type { Plugin } from "@opencode-ai/plugin"

export const NotificationPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  console.log("Notification plugin initialized!")

  return {
    "session.created": async (input) => {
      await client.app.log({
        body: {
          service: "notification-plugin",
          level: "info",
          message: `New session created: ${input.sessionID}`,
          extra: {
            project: project.name,
            directory,
          },
        },
      })

      await $`osascript -e 'display notification "Session started!" with title "OpenCode"'`.catch(() => {})
    },

    "session.idle": async (input) => {
      await client.app.log({
        body: {
          service: "notification-plugin",
          level: "info",
          message: `Session idle: ${input.sessionID}`,
        },
      })

      await $`osascript -e 'display notification "Session completed!" with title "OpenCode"'`.catch(() => {})
    },

    "session.error": async (input) => {
      await client.app.log({
        body: {
          service: "notification-plugin",
          level: "error",
          message: `Session error: ${input.error}`,
        },
      })

      await $`osascript -e 'display notification "Session error: ${input.error}" with title "OpenCode"'`.catch(() => {})
    },

    "session.compacted": async (input) => {
      await client.app.log({
        body: {
          service: "notification-plugin",
          level: "info",
          message: `Session compacted: ${input.sessionID}`,
        },
      })
    },
  }
}
