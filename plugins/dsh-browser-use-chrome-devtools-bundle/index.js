/**
 * Activation-time Chrome bootstrap for the chrome-devtools browser-use
 * provider; the official provider rows are untouched.
 * @module @gdm257/dsh-browser-use-chrome-devtools-bundle
 */

import { homedir } from 'node:os'
import { spawn } from 'node:child_process'

import { bootstrapChrome } from './lib/bootstrap.mjs'

/** Cordis plugin name. */
export const name = 'browser-use-chrome-devtools-bootstrap'

const defaultDeps = () => ({ platform: process.platform, env: process.env, home: homedir(), spawn })

/**
 * Ensure a usable Chrome before the provider starts launching browsers.
 * Best effort by contract: fire-and-forget, failures are logged and never
 * block registration.
 * @param ctx - the mounting context.
 * @param input - row config, unused.
 * @param deps - injectable seams for tests.
 */
export function apply(ctx, input, deps = defaultDeps()) {
  const { spawn: spawnFn, ...rest } = deps
  void bootstrapChrome({ log: ctx?.logger ?? console, spawnFn, ...rest }).catch((err) =>
    ctx?.logger?.error?.(`chrome-devtools: bootstrap crashed: ${err}`),
  )
}
