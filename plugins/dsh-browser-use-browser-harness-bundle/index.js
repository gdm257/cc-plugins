/**
 * browser-harness provider on the browser-use registry: one shared Dedicated
 * Chrome behind a reference count, one Browser lane per live Session.
 * @module @gdm257/dsh-browser-use-browser-harness-bundle
 */

import { spawn } from 'node:child_process'

import Schema from '@deepseek-ai/schemastery'
import { BrowserUseProviderName } from '@deepseek-ai/dsh-browser-use/brand'
import { SessionResources } from '@deepseek-ai/dsh-experimental-browser-use-runtime'

import { launchChrome } from './lib/chrome.mjs'
import { createChromeManager } from './lib/chrome-manager.mjs'
import { resolveCli } from './lib/cli.mjs'
import { createLaneOpener } from './lib/lane.mjs'
import { disableTelemetry } from './lib/run.mjs'
import { mountTools } from './lib/tools.mjs'

/** Cordis plugin name. */
export const name = 'browser-use-browser-harness'

/** Services consumed via ctx: provider registry plus the tooling surface. */
export const inject = ['browserUse', 'agents', 'tools', 'systemPrompt']

/** proxy / chromePath optional, headless by default. */
export const Config = Schema.object({
  proxy: Schema.string(),
  chromePath: Schema.string(),
  headless: Schema.boolean().default(true),
})

const defaultDeps = () => ({ resolveCli, launchChrome, spawn })

/**
 * Validate the environment, then claim the provider slot and mount the lane
 * machinery inside one effect: register → Chrome manager + SessionResources →
 * child plugin with tools and prompt section. Disposal runs in reverse.
 * @param ctx - the mounting context.
 * @param input - row config, re-validated here.
 * @param deps - injectable seams for tests.
 */
export function apply(ctx, input, deps = defaultDeps()) {
  const config = Config(input)
  const cli = deps.resolveCli()
  // One-shot opt-out; failure must not break activation.
  void disableTelemetry({ cli, spawnFn: deps.spawn })

  ctx.effect(function* () {
    yield ctx.browserUse.register(BrowserUseProviderName('browser-harness'))
    const manager = createChromeManager(() => deps.launchChrome({ config }))
    const resources = new SessionResources(ctx, {
      label: 'browser-harness',
      exclusive: false,
      open: createLaneOpener({ manager, cli, spawnFn: deps.spawn }),
    })
    yield () => resources.dispose()
    const child = ctx.plugin({
      name: 'browser-use-browser-harness_tools',
      inject: ['agents', 'tools', 'systemPrompt'],
      apply: (inner) => mountTools(inner, { resources }),
    })
    yield child.dispose
  })
}
