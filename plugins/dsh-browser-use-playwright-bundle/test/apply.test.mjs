// Offline tests for the plugin apply(): bootstrap runs, registration is never blocked.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

const entry = await import('../index.js')

const makeLogger = () => {
  const lines = { info: [], warn: [], error: [] }
  return {
    lines,
    info: (msg) => lines.info.push(msg),
    warn: (msg) => lines.warn.push(msg),
    error: (msg) => lines.error.push(msg),
  }
}

const makeCtx = () => ({ logger: makeLogger() })

const okDeps = (log) => ({
  ensureBrowser: async (options) => {
    log.push(options)
  },
})

test('entry exports the plugin contract', () => {
  assert.equal(entry.name, 'browser-use-playwright-bootstrap')
  assert.equal(typeof entry.apply, 'function')
})

test('apply: runs the bootstrap once and returns normally', async () => {
  const calls = []
  const ctx = makeCtx()
  entry.apply(ctx, {}, okDeps(calls))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].logger, ctx.logger)
})

test('apply: bootstrap rejection is swallowed, not rethrown', async () => {
  const ctx = makeCtx()
  entry.apply(ctx, {}, {
    ensureBrowser: async () => {
      throw new Error('boom')
    },
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(ctx.logger.lines.error.length, 1)
  assert.match(ctx.logger.lines.error[0], /boom/)
})
