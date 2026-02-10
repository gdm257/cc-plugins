import type { Plugin } from "@opencode-ai/plugin"

export const EnvInjectorPlugin: Plugin = async ({ project, directory, worktree }) => {
  return {
    "shell.env": async (input, output) => {
      output.env.OPENCODE_PLUGIN = "env-injector"
      output.env.PLUGIN_VERSION = "1.0.0"

      output.env.PROJECT_NAME = project.name || "unknown"
      output.env.PROJECT_ROOT = directory
      output.env.WORKTREE = worktree

      output.env.NODE_ENV = process.env.NODE_ENV || "development"

      output.env.CURRENT_TIMESTAMP = Date.now().toString()
      output.env.CURRENT_DATE = new Date().toISOString().split("T")[0]

      if (process.env.API_KEY) {
        output.env.SHARED_API_KEY = process.env.API_KEY
      }

      if (process.env.GITHUB_TOKEN) {
        output.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN
      }

      const configEnv = process.env.CONFIG_ENV || "default"
      output.env.CONFIG_ENV = configEnv

      output.env.DEBUG_MODE = process.env.DEBUG === "true" ? "true" : "false"
      output.env.VERBOSE_LOGGING = process.env.VERBOSE === "true" ? "true" : "false"

      output.env.TEMP_DIR = input.cwd.includes("temp") ? input.cwd : "/tmp"

      output.env.USER_HOME = process.env.HOME || process.env.USERPROFILE || "~"

      output.env.BUN_VERSION = process.env.BUN_VERSION || "unknown"
      output.env.NODE_VERSION = process.env.NODE_VERSION || "unknown"
    },

    "session.created": async (input) => {
      console.log(`Environment injected for session ${input.sessionID}`)
    },
  }
}

export const ProjectEnvPlugin: Plugin = async ({ project, directory }) => {
  return {
    "shell.env": async (input, output) => {
      output.env.PROJECT_NAME = project.name || "unknown"
      output.env.PROJECT_VERSION = project.version || "unknown"

      output.env.SRC_DIR = `${directory}/src`
      output.env.LIB_DIR = `${directory}/lib`
      output.env.DIST_DIR = `${directory}/dist`

      output.env.TEST_COMMAND = project.scripts?.test || "echo 'No test command'"
      output.env.BUILD_COMMAND = project.scripts?.build || "echo 'No build command'"

      const config = project.config || {}
      output.env.TARGET_BROWSER = config.target || "node"
      output.env.COMPILE_TARGET = config.target || "ES2020"
    },
  }
}

export const SecretEnvPlugin: Plugin = async () => {
  return {
    "shell.env": async (input, output) => {
      if (process.env.DATABASE_URL) {
        output.env.DATABASE_URL = process.env.DATABASE_URL
      }

      if (process.env.REDIS_URL) {
        output.env.REDIS_URL = process.env.REDIS_URL
      }

      if (process.env.JWT_SECRET) {
        output.env.JWT_SECRET = process.env.JWT_SECRET
      }

      output.env.HAS_SECRETS = process.env.DATABASE_URL || process.env.JWT_SECRET ? "true" : "false"
    },
  }
}
