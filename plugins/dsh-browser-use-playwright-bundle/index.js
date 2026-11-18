/**
 * Activation bootstrap for the playwright browser-use provider: install the
 * expected chrome-for-testing cache once, then let the official provider rows
 * register unchanged.
 * @module @gdm257/dsh-browser-use-playwright-bundle
 */

import { ensureBrowser } from './lib/bootstrap.mjs'

/** Cordis plugin name, matches the patch row id. */
export const name = 'browser-use-playwright-bootstrap'

const defaultDeps = () => ({ ensureBrowser })

/**
 * Kick off the browser bootstrap; it never blocks or breaks activation.
 * @param ctx - the mounting context.
 * @param input - row config, unused.
 * @param deps - injectable seams for tests.
 */
export function apply(ctx, input, deps = defaultDeps()) {
  void deps
    .ensureBrowser({ logger: ctx.logger })
    .catch((err) => ctx.logger?.error?.(`browser-use-playwright: bootstrap crashed: ${err}`))
}
