import type { Plugin } from "@opencode-ai/plugin"

export const CompactionPlugin: Plugin = async ({ client, project }) => {
  return {
    "experimental.session.compacting": async (input, output) => {
      output.context.push({
        type: "text",
        content: `## Project Context
- Name: ${project.name || "Unknown"}
- Directory: ${input.sessionID.split("-")[0] || "N/A"}

## Active Work
Focus on completing the current task without introducing new scope.

## Next Steps
1. Review changes made
2. Verify functionality
3. Clean up temporary files`,
      })

      await client.app.log({
        body: {
          service: "compaction-plugin",
          level: "info",
          message: "Injected custom context for compaction",
        },
      })
    },
  }
}

export const DetailedCompactionPlugin: Plugin = async ({ project }) => {
  return {
    "experimental.session.compacting": async (input, output) => {
      const sessionContext = {
        type: "text",
        content: `# Session Continuation Summary

## Current Session
- Project: ${project.name || "Unknown"}
- Session ID: ${input.sessionID}

## Files Being Modified
${
  input.messages
    ?.filter((m: any) => m.role === "assistant")
    .slice(-5)
    .map((m: any) => `- ${m.content?.substring(0, 100)}...`)
    .join("\n") || "- No files identified"
}

## Task Status
- Working on: Current implementation
- Progress: In progress
- Blocker: None

## Next Actions
1. Continue implementation
2. Test changes
3. Review and refine

## Important Notes
- Maintain code quality
- Follow project conventions
- Document changes`,
      }

      output.context.push(sessionContext)
    },
  }
}

export const MinimalCompactionPlugin: Plugin = async () => {
  return {
    "experimental.session.compacting": async (input, output) => {
      output.context.push({
        type: "text",
        content: `## Quick Summary
Session: ${input.sessionID}
Continue the work. Focus on the task at hand.`,
      })
    },
  }
}

export const CustomPromptCompactionPlugin: Plugin = async () => {
  return {
    "experimental.session.compacting": async (input, output) => {
      output.prompt = `You are continuing a multi-agent session. Your task is to:

1. Understand the current state of work
2. Identify the next steps needed
3. Execute the next task
4. Provide a summary of what was accomplished

## Session: ${input.sessionID}

Respond with:
- What you're working on
- What you just did
- What you will do next

Keep it brief and actionable.`
    },
  }
}

export const AgentCompactionPlugin: Plugin = async ({ client }) => {
  return {
    "experimental.session.compacting": async (input, output) => {
      output.context.push({
        type: "text",
        content: `## Multi-Agent Session State

## Agent Status
Track which agent is doing what work.

## Dependencies
Note any dependencies between tasks.

## File Ownership
- agent-1: Frontend changes
- agent-2: Backend changes
- agent-3: Documentation

## Next Agent
The next agent should continue from where the previous left off.`,
      })

      await client.app.log({
        body: {
          service: "agent-compaction",
          level: "info",
          message: "Prepared agent context for session continuation",
        },
      })
    },
  }
}
