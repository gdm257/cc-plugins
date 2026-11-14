/**
 * Claude Code core prompt as one global system-prompt section.
 *
 * `dsh-system-prompt` assembles the model-facing prompt from ordered
 * sections; this row registers the captured Claude Code core guidance at
 * order 100 — after the persona prefix (0), before plan policy (500) and the
 * tool guidance sections (900+). Registered globally, so every preset and
 * subagent in the profile receives it, while DSH's operational sections stay
 * intact.
 * @module @local/dsh-cc-prompt
 */

import { readFileSync } from 'node:fs'

/** Cordis plugin name. */
export const name = 'cc-prompt'

/** The prompt registry this row contributes to. */
export const inject = ['systemPrompt']

/** Literal section text: Claude Code's core prompt, adapted for DSH (see docs/DETAIL.md). */
const text = readFileSync(new URL('./prompt.md', import.meta.url), 'utf8').replace(/\r?\n$/, '')

/**
 * Register the core guidance section for every agent scope.
 * @param ctx - the mounting context.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'cc-prompt:core',
    order: 100,
    interpolate: false,
    text,
  }), 'cc-prompt.section()')
}
