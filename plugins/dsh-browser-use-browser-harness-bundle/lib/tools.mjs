/**
 * browser_run / browser_status tool definitions and the browser-use prompt
 * guidance, mounted on the provider's child plugin context.
 */

import { defineTool } from '@deepseek-ai/dsh-tools'

import { RUN_TIMEOUT_MS } from './run.mjs'

/** Headroom over the runner's internal kill so the tool never aborts first. */
const TOOL_TIMEOUT_MS = RUN_TIMEOUT_MS + 60_000

const runOutputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    exitCode: { oneOf: [{ type: 'integer' }, { type: 'null' }], description: 'null when the runner was killed by timeout or abort' },
    stdout: { type: 'string' },
    stderr: { type: 'string' },
    hint: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'actionable next step; read this first when ok is false' },
  },
}

export const PROMPT = `Browser automation runs through browser_run (Python via browser-harness) against a dedicated Chrome with a persistent profile. Each session owns one lane - its own daemon and current tab; other sessions' tabs are not yours to touch. Logins done in this profile persist across sessions.

- First navigation for a task: new_tab(url), then wait_for_load() and print(page_info()). Do not call new_tab() again for the same task; reuse your tab with current_tab() / list_tabs() / switch_tab(), and close tabs you created once done.
- Prefer the accessibility tree over pixels: cdp("Accessibility.getFullAXTree") then filter in Python before printing. js(...) reads DOM facts; screenshot(...) only when layout matters. Raw CDP is cdp("Domain.method", **params).
- print() is the only channel back; keep printed output bounded (slice large trees).
- Calls in one session are serialized; keep each script short - the runner is killed after 120s.
- browser_status reports the lane, CDP endpoint, CLI source and daemon health when the environment looks broken.

Login walls: stop and ask the user. Never type, submit or read back passwords, OTP or MFA codes. If a one-time login is needed, ask the user to enable headless: false in the plugin config, sign in, and switch back; the profile keeps the session.

This Chrome is plugin-managed: its proxy and chromePath come from plugin config only. Do not attach to the user's own Chrome or change proxy settings from scripts.`

/** browser_run: arbitrary Python on the session's lane. */
export function browserRunTool({ resources, requireAgent }) {
  return defineTool({
    name: 'browser_run',
    description: 'Execute Python against the dedicated Chrome of this session. browser-harness helpers (new_tab, wait_for_load, page_info, cdp, js, screenshot, list_tabs, switch_tab) are pre-imported; print() output is the result. On failure read hint first.',
    parameters: {
      code: { type: 'string', required: true, description: 'Python source to run; keep each script short and print bounded results' },
    },
    timeoutMs: TOOL_TIMEOUT_MS,
    output: {
      schema: runOutputSchema,
      render: (args, value) => [{ type: 'text', text: value.ok ? value.stdout : `${value.hint ?? ''}\n${value.stderr}`.trim() }],
    },
    async execute(args, exec) {
      const agent = requireAgent()
      const lane = await resources.get(agent)
      return resources.run(agent, exec?.signal, () => lane.run(args.code, { signal: exec?.signal }))
    },
  })
}

/** browser_status: lane health report after a warmup run. */
export function browserStatusTool({ resources, requireAgent }) {
  return defineTool({
    name: 'browser_status',
    description: 'Report the health of this session\'s browser lane: CLI source, dedicated Chrome CDP endpoint, lane name, daemon doctor output and warmup result.',
    parameters: {},
    timeoutMs: TOOL_TIMEOUT_MS,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          cli: { type: 'string' },
          mode: { type: 'string' },
          cdpUrl: { type: 'string' },
          lane: { type: 'string' },
          healthy: { oneOf: [{ type: 'boolean' }, { type: 'null' }] },
          doctor: { type: 'json' },
          warmup: {
            type: 'object',
            additionalProperties: false,
            properties: {
              ok: { type: 'boolean' },
              exitCode: { oneOf: [{ type: 'integer' }, { type: 'null' }] },
            },
          },
        },
      },
      render: (args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args, exec) {
      const agent = requireAgent()
      const lane = await resources.get(agent)
      return resources.run(agent, exec?.signal, () => lane.status())
    },
  })
}

/** Mount the prompt section and both tools on the child plugin context; returns a disposer. */
export function mountTools(ctx, { resources }) {
  const requireAgent = () => ctx.agents.requireInitiator()
  const disposers = [
    ctx.systemPrompt.section({
      name: 'browser-use-browser-harness',
      order: ctx.systemPrompt.getSectionOrder('TOOL_COMPUTER_USE'),
      text: PROMPT,
    }),
    ctx.tools.register(browserRunTool({ resources, requireAgent })),
    ctx.tools.register(browserStatusTool({ resources, requireAgent })),
  ]
  return () => disposers.forEach((dispose) => dispose())
}
